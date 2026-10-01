import { useSyncExternalStore } from 'react'

export interface ListFieldVisibility {
  description: boolean
  assignee: boolean
  priority: boolean
  dueDate: boolean
}

// Igual al comportamiento efectivo actual de TaskRow antes de este cambio:
// prioridad/fecha siempre visibles (atadas antes a `density`, ahora a
// esto), asignado y descripción son nuevos y arrancan apagados.
const DEFAULT_VISIBILITY: ListFieldVisibility = {
  description: false,
  assignee: true,
  priority: true,
  dueDate: true,
}

const EVENT = 'flow:list-fields-change'
const storageKey = (projectId: string) => `flow:list-fields:${projectId}`

// A diferencia de density.ts/task-view-mode.ts (snapshot primitivo), acá
// el snapshot es un objeto — parsear JSON en cada getSnapshot() devolvería
// una referencia nueva en cada llamada y useSyncExternalStore lo trataría
// como "cambió" en cada render (riesgo real de loop). Se cachea por el
// string crudo de localStorage: mismo raw -> misma referencia devuelta.
const cache = new Map<string, { raw: string | null; value: ListFieldVisibility }>()

function getSnapshot(projectId: string): ListFieldVisibility {
  const raw = localStorage.getItem(storageKey(projectId))
  const cached = cache.get(projectId)
  if (cached && cached.raw === raw) return cached.value
  const value: ListFieldVisibility = raw ? { ...DEFAULT_VISIBILITY, ...JSON.parse(raw) } : DEFAULT_VISIBILITY
  cache.set(projectId, { raw, value })
  return value
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function useListFieldVisibility(projectId: string): ListFieldVisibility {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(projectId),
    () => DEFAULT_VISIBILITY,
  )
}

export function toggleListField(projectId: string, field: keyof ListFieldVisibility) {
  const current = getSnapshot(projectId)
  localStorage.setItem(storageKey(projectId), JSON.stringify({ ...current, [field]: !current[field] }))
  window.dispatchEvent(new Event(EVENT))
}
