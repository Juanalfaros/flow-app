import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  fetchTaskSummary,
  taskDetailQueryOptions,
  tasksListKeyPrefix,
  type TaskSummary,
} from '@/features/tasks/queries'
import { workspaceMembersQueryOptions } from '@/features/workspace/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import type { Database } from '@/types/database'

type NodeMembershipRow = Database['public']['Tables']['node_memberships']['Row']
type NodeRow = Database['public']['Tables']['nodes']['Row']

function resolveAssignee(qc: QueryClient, workspaceId: string, assigneeId: string | null) {
  if (!assigneeId) return null
  const members = qc.getQueryData(workspaceMembersQueryOptions(workspaceId).queryKey)
  return members?.find((m) => m.user_id === assigneeId)?.profile ?? null
}

// Altas/bajas/reorden dentro de ESTE contenedor — Postgres Changes solo
// filtra por columna igual, así que esto cubre lo que antes cubría
// `project_id=eq.X` sobre `tasks`, ahora vía la tabla de membership.
async function applyMembershipChange(
  qc: QueryClient,
  containerId: string,
  payload: RealtimePostgresChangesPayload<NodeMembershipRow>,
) {
  // Prefijo, no key exacta: `tasksQueryOptions` cachea por separado según
  // `includeDescription` (ver queries.ts) — un patch a una sola variante
  // dejaría la otra desactualizada para siempre (`staleTime: Infinity`).
  const keyPrefix = tasksListKeyPrefix(containerId)

  if (payload.eventType === 'DELETE') {
    const nodeId = (payload.old as { node_id?: string }).node_id
    if (!nodeId) return
    qc.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) => old?.filter((t) => t.id !== nodeId))
    return
  }

  const row = payload.new

  if (payload.eventType === 'INSERT') {
    // Este chequeo es solo un atajo (evitar el fetch si ya sabemos que no
    // hace falta) — NO alcanza como única guarda: entre este chequeo y el
    // `setQueriesData` de abajo hay un `await` real (fetchTaskSummary), y
    // en ese hueco puede terminar el onSuccess de useCreateTaskMutation
    // (uno mismo creando la tarea) y agregarla primero. Con esta guarda
    // sola, cuando el fetch de acá resolvía, insertaba una SEGUNDA copia
    // sin volver a mirar el cache — quedaba duplicada hasta el próximo
    // refetch completo. Bug real reportado por el usuario ("se duplica al
    // crear, con actualizar queda una sola"). El chequeo de verdad tiene
    // que ir DENTRO del updater de `setQueriesData` (corre sync, contra
    // el estado del cache en ESE instante, no el de cuando arrancó el
    // await).
    const exists = qc
      .getQueriesData<TaskSummary[]>({ queryKey: keyPrefix })
      .some(([, data]) => data?.some((t) => t.id === row.node_id))
    if (exists) return
    // Sin descripción (mismo shape que TASK_NODE_SELECT default): el
    // insert de otro usuario llega sin ese campo hasta el próximo fetch
    // completo — gap menor aceptado, no justifica una segunda query acá.
    const fresh = await fetchTaskSummary(row.node_id, containerId)
    qc.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) =>
      old?.some((t) => t.id === fresh.id) ? old : [...(old ?? []), fresh],
    )
    return
  }

  // UPDATE: en la práctica solo cambia `position` (drag de otro usuario).
  qc.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) =>
    old
      ?.map((t) => (t.id === row.node_id ? { ...t, position: row.position } : t))
      .sort((a, b) => a.position - b.position),
  )
}

// Ediciones de campos — no se puede filtrar por `container_id` (no es
// columna de `nodes`), así que el canal se suscribe más ancho (por
// `workspace_id`) y se descarta client-side lo que no aplica a este
// contenedor. Trade-off aceptado, ver PLAN.md (riesgo de volumen de
// mensajes Realtime). El INSERT se ignora acá a propósito — lo maneja
// `applyMembershipChange`, evita altas duplicadas si ambos eventos llegan.
async function applyNodeChange(
  qc: QueryClient,
  containerId: string,
  workspaceId: string,
  payload: RealtimePostgresChangesPayload<NodeRow>,
) {
  if (payload.eventType !== 'UPDATE') return
  const row = payload.new
  if (row.type !== 'task') return

  const keyPrefix = tasksListKeyPrefix(containerId)
  const inThisContainer = qc
    .getQueriesData<TaskSummary[]>({ queryKey: keyPrefix })
    .some(([, data]) => data?.some((t) => t.id === row.id))
  if (!inThisContainer) return

  const patch = (t: TaskSummary): TaskSummary => ({
    ...t,
    ...row,
    container_id: t.container_id,
    position: t.position,
    // `row` (payload completo de postgres_changes sobre `nodes`) sí trae
    // `description` siempre (Postgres manda la fila entera en UPDATE, no
    // solo las columnas cambiadas) — el spread la actualiza igual que
    // cualquier otro campo, correcto tanto si `t` la tenía cargada
    // (includeDescription:true) como si no.
    assignee:
      row.assignee_id !== t.assignee_id
        ? resolveAssignee(qc, workspaceId, row.assignee_id)
        : t.assignee,
  })
  qc.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) => old?.map((t) => (t.id === row.id ? patch(t) : t)))
  qc.setQueryData(taskDetailQueryOptions(row.id).queryKey, (old) => (old ? { ...old, ...row } : old))
}

export function useContainerRealtimeChannel(containerId: string) {
  const queryClient = useQueryClient()
  const { workspaceId } = useCurrentWorkspace()

  useEffect(() => {
    if (!containerId || !workspaceId) return
    let channel: RealtimeChannel | null = null
    // React StrictMode (dev) monta este efecto, lo limpia, y lo vuelve a
    // montar de inmediato — `supabase.removeChannel` desuscribe de forma
    // asíncrona, así que el canal "viejo" del primer montaje puede seguir
    // entregando el mismo evento postgres_changes un instante después de
    // que el segundo montaje ya se suscribió. Sin este guard, ambos
    // canales corren su propio chequeo "exists" en paralelo, ninguno ve
    // todavía la fila que insertó el otro, y la tarea queda duplicada en
    // pantalla hasta refrescar (bug real encontrado probando en
    // navegador). `active` referencia la instancia de efecto actual —
    // se pone en false en el cleanup, y los handlers de ESE canal dejan
    // de aplicar cambios aunque el evento les siga llegando.
    let active = true

    function subscribe() {
      channel = supabase
        .channel(`container:${containerId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'node_memberships', filter: `container_id=eq.${containerId}` },
          (payload) => {
            if (!active) return
            void applyMembershipChange(
              queryClient,
              containerId,
              payload as RealtimePostgresChangesPayload<NodeMembershipRow>,
            )
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'nodes', filter: `workspace_id=eq.${workspaceId}` },
          (payload) => {
            if (!active) return
            void applyNodeChange(
              queryClient,
              containerId,
              workspaceId,
              payload as RealtimePostgresChangesPayload<NodeRow>,
            )
          },
        )
        .subscribe()
    }

    function resyncAndResubscribe() {
      if (channel) supabase.removeChannel(channel)
      // Red de seguridad: eventos perdidos mientras la pestaña estuvo
      // oculta o sin red no llegan por el canal (estaba cerrado), así
      // que se pide 1 vez la lista completa al volver.
      void queryClient.invalidateQueries({ queryKey: tasksListKeyPrefix(containerId) })
      subscribe()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (channel) supabase.removeChannel(channel)
        channel = null
      } else {
        resyncAndResubscribe()
      }
    }

    subscribe()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', resyncAndResubscribe)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', resyncAndResubscribe)
      if (channel) supabase.removeChannel(channel)
    }
  }, [containerId, workspaceId, queryClient])
}
