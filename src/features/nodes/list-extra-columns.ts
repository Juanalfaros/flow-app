import { useSyncExternalStore } from 'react'

// Columnas extra de Lista (campos personalizados del proyecto,
// mostrados como columna vía el "+ Añadir" del encabezado) — mismo
// patrón que list-fields.ts (localStorage por proyecto, sin backend:
// es una preferencia de vista, no un dato del proyecto). Array de ids
// de `project_custom_fields`, no un boolean por campo: el orden en que
// se agregan es el orden en que aparecen las columnas.
const EVENT = 'flow:list-extra-columns-change'
const storageKey = (projectId: string) => `flow:list-extra-columns:${projectId}`

const cache = new Map<string, { raw: string | null; value: string[] }>()

function getSnapshot(projectId: string): string[] {
  const raw = localStorage.getItem(storageKey(projectId))
  const cached = cache.get(projectId)
  if (cached && cached.raw === raw) return cached.value
  const value: string[] = raw ? JSON.parse(raw) : []
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

const EMPTY: string[] = []

export function useListExtraColumns(projectId: string): string[] {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(projectId),
    () => EMPTY,
  )
}

export function toggleListExtraColumn(projectId: string, fieldId: string) {
  const current = getSnapshot(projectId)
  const next = current.includes(fieldId) ? current.filter((id) => id !== fieldId) : [...current, fieldId]
  localStorage.setItem(storageKey(projectId), JSON.stringify(next))
  window.dispatchEvent(new Event(EVENT))
}
