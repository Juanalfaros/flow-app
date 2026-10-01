import { useSyncExternalStore } from 'react'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fetchTaskSummary, tasksListKeyPrefix, type TaskSummary } from '@/features/tasks/queries'
import type { Database } from '@/types/database'

type CreateTaskNodeArgs = Database['public']['Functions']['create_task_node']['Args']
type MoveTaskNodeArgs = Database['public']['Functions']['move_task_node']['Args']
type NodeUpdate = Database['public']['Tables']['nodes']['Update']

export interface QueuedMutation {
  client_id: string // uuid v4, keyPath — idempotencia
  created_at: string // ISO, orden de flush
  op: 'insert' | 'update' | 'move' | 'delete'
  node_id: string
  container_id: string
  payload: Record<string, unknown>
  base_updated_at: string | null // snapshot al encolar, solo informativo
  status: 'pending' | 'syncing' | 'error'
  retry_count: number
  last_error?: string
}

export interface QueueDescriptor {
  op: 'insert' | 'update' | 'move' | 'delete'
  node_id: string
  container_id: string
  payload: Record<string, unknown>
  base_updated_at?: string | null
}

interface OfflineDB extends DBSchema {
  mutations: {
    key: string
    value: QueuedMutation
    indexes: { by_created_at: string }
  }
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null
function getDb() {
  if (!dbPromise) {
    // v2: shape de QueuedMutation cambió de forma incompatible (table
    // desaparece, task_id/project_id -> node_id/container_id, se suma
    // op:'move'). Cualquier mutación pendiente en el store v1 de un
    // usuario que cruce este deploy se pierde — aceptado, ver PLAN.md
    // (sin usuarios de producción reales que proteger).
    dbPromise = openDB<OfflineDB>('flow-offline', 2, {
      upgrade(db) {
        if (db.objectStoreNames.contains('mutations')) {
          db.deleteObjectStore('mutations')
        }
        const store = db.createObjectStore('mutations', { keyPath: 'client_id' })
        store.createIndex('by_created_at', 'created_at')
      },
    })
  }
  return dbPromise
}

// ============================================================
// Estado de conectividad (offline-queue.ts es el dueño único de esta
// señal — evita un tercer archivo no contemplado en el plan)
// ============================================================

export interface ConnectionState {
  isOnline: boolean
  pendingCount: number
  isSyncing: boolean
}

let state: ConnectionState = { isOnline: navigator.onLine, pendingCount: 0, isSyncing: false }
const listeners = new Set<() => void>()

function setState(patch: Partial<ConnectionState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useConnectionStatus(): ConnectionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

async function refreshPendingCount() {
  const db = await getDb()
  setState({ pendingCount: await db.count('mutations') })
}

async function enqueue(descriptor: QueueDescriptor) {
  const db = await getDb()
  const entry: QueuedMutation = {
    client_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    op: descriptor.op,
    node_id: descriptor.node_id,
    container_id: descriptor.container_id,
    payload: descriptor.payload,
    base_updated_at: descriptor.base_updated_at ?? null,
    status: 'pending',
    retry_count: 0,
  }
  await db.put('mutations', entry)
  await refreshPendingCount()
}

function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true
  return err instanceof TypeError && /fetch/i.test(err.message)
}

/**
 * Envuelve el `mutationFn` de una mutation existente sin tocar su
 * `onMutate`/`onError`/`onSuccess`. Si no hay red (o el request falla
 * por red), encola y resuelve con `fabricate()` en vez de lanzar — así
 * el `onError` local de la mutation nunca se dispara y el patch
 * optimista de `onMutate` queda intacto. Un error real de servidor (RLS,
 * validación) se relanza tal cual para que el rollback normal ocurra.
 */
export async function withOfflineFallback<T>(
  descriptor: QueueDescriptor,
  run: () => Promise<T>,
  fabricate: () => T,
): Promise<T> {
  if (!navigator.onLine) {
    await enqueue(descriptor)
    return fabricate()
  }
  try {
    return await run()
  } catch (err) {
    if (!isNetworkError(err)) throw err
    await enqueue(descriptor)
    return fabricate()
  }
}

let queryClientRef: QueryClient | null = null

export function initOfflineQueue(queryClient: QueryClient) {
  queryClientRef = queryClient
  void refreshPendingCount()
  window.addEventListener('online', () => {
    setState({ isOnline: true })
    void flushQueue()
  })
  window.addEventListener('offline', () => setState({ isOnline: false }))
}

// ============================================================
// Flush al reconectar
// ============================================================

function isDuplicateInsert(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}

async function patchListCache(containerId: string, updater: (old: TaskSummary[] | undefined) => TaskSummary[] | undefined) {
  // Prefijo, no key exacta: mismo motivo que en tasks/mutations.ts —
  // `tasksQueryOptions` cachea por separado según `includeDescription`.
  queryClientRef?.setQueriesData<TaskSummary[]>({ queryKey: tasksListKeyPrefix(containerId) }, updater)
}

async function applyQueuedEntry(entry: QueuedMutation) {
  if (entry.op === 'delete') {
    const { error } = await supabase.from('nodes').delete().eq('id', entry.node_id)
    if (error) throw error
    await patchListCache(entry.container_id, (old) => old?.filter((t) => t.id !== entry.node_id))
    return
  }

  if (entry.op === 'insert') {
    // El shape real (nombres de argumentos de la RPC) lo garantiza quien
    // arma el QueueDescriptor en tasks/mutations.ts — `entry.payload`
    // pierde esa info estática al pasar por IndexedDB.
    const { error } = await supabase.rpc('create_task_node', entry.payload as CreateTaskNodeArgs)
    if (error && !isDuplicateInsert(error)) throw error
    const fresh = await fetchTaskSummary(entry.node_id, entry.container_id)
    await patchListCache(entry.container_id, (old) => {
      if (old?.some((t) => t.id === fresh.id)) return old
      return [...(old ?? []), fresh]
    })
    return
  }

  if (entry.op === 'move') {
    const payload = entry.payload as { status_id: string; position: number }
    const args: MoveTaskNodeArgs = {
      p_node_id: entry.node_id,
      p_container_id: entry.container_id,
      p_status_id: payload.status_id,
      p_position: payload.position,
    }
    const { error } = await supabase.rpc('move_task_node', args)
    if (error) throw error
    await patchListCache(entry.container_id, (old) =>
      old?.map((t) => (t.id === entry.node_id ? { ...t, ...payload } : t)),
    )
    return
  }

  // update
  const { data: current } = await supabase
    .from('nodes')
    .select('updated_at')
    .eq('id', entry.node_id)
    .maybeSingle()
  if (!current) {
    toast.info('Una tarea que editaste offline fue eliminada por otra persona.')
    return
  }
  if (entry.base_updated_at && current.updated_at !== entry.base_updated_at) {
    toast.info('Se aplicó tu cambio sobre una versión más reciente de la tarea.')
  }
  const updatePayload = entry.payload as NodeUpdate
  const { error } = await supabase.from('nodes').update(updatePayload).eq('id', entry.node_id)
  if (error) throw error
  await patchListCache(entry.container_id, (old) =>
    old?.map((t) => (t.id === entry.node_id ? { ...t, ...entry.payload } : t)),
  )
}

let isFlushing = false

export async function flushQueue() {
  if (isFlushing || !navigator.onLine) return
  isFlushing = true
  setState({ isSyncing: true })
  try {
    const db = await getDb()
    const entries = await db.getAllFromIndex('mutations', 'by_created_at')
    const touchedContainerIds = new Set<string>()

    for (const entry of entries) {
      try {
        await applyQueuedEntry(entry)
        await db.delete('mutations', entry.client_id)
        touchedContainerIds.add(entry.container_id)
      } catch (err) {
        if (isDuplicateInsert(err)) {
          await db.delete('mutations', entry.client_id)
          touchedContainerIds.add(entry.container_id)
        } else {
          await db.put('mutations', {
            ...entry,
            status: 'error',
            retry_count: entry.retry_count + 1,
            last_error: String(err),
          })
          // 1 entrada rota no bloquea el resto de la cola
        }
      }
      await refreshPendingCount()
    }

    for (const containerId of touchedContainerIds) {
      queryClientRef?.invalidateQueries({ queryKey: tasksListKeyPrefix(containerId) })
    }
  } finally {
    setState({ isSyncing: false })
    isFlushing = false
  }
}

/**
 * Descarta la cola al cerrar sesión. Sin esto, las mutaciones que el usuario
 * A dejó encoladas offline se hacen flush bajo la sesión del usuario B en el
 * mismo equipo (`flushQueue` solo mira `navigator.onLine`, no quién está
 * logueado): se escribirían con la identidad equivocada, o fallarían contra
 * la RLS de B dejando entradas en estado 'error' que no le pertenecen.
 *
 * Es un descarte, no un flush previo: al llegar el SIGNED_OUT ya no hay token
 * con qué escribirlas. Aceptado — el mismo trade-off que documenta el
 * `upgrade` de v2 más arriba.
 */
export async function clearOfflineQueue() {
  const db = await getDb()
  await db.clear('mutations')
  await refreshPendingCount()
}

export { getDb }
