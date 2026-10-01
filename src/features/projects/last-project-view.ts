import { useSyncExternalStore } from 'react'

export type ProjectViewRoute =
  | '/p/$projectId/summary'
  | '/p/$projectId/board'
  | '/p/$projectId/list'
  | '/p/$projectId/calendar'
  | '/p/$projectId/gantt'
  | '/p/$projectId/table'

// S-03/S-09: Favoritos y el árbol de espacios navegaban siempre a
// /summary, aunque la persona hubiera estado trabajando en Board o Lista
// — cada click "reseteaba" la vista. Se recuerda la última vista por
// proyecto (mismo patrón `useSyncExternalStore` + localStorage que
// task-view-mode.ts) y los links del sidebar navegan ahí.
const STORAGE_KEY = 'flow:last-project-view'
const EVENT = 'flow:last-project-view-change'

function readMap(): Record<string, ProjectViewRoute> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function setLastProjectView(projectId: string, route: ProjectViewRoute) {
  const map = readMap()
  if (map[projectId] === route) return
  map[projectId] = route
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage puede fallar (modo privado, cuota) — perder el recuerdo
    // de la última vista no es crítico, el fallback sigue siendo /summary.
  }
  window.dispatchEvent(new Event(EVENT))
}

// Un hook parametrizado por projectId, no un snapshot global: el sidebar
// renderiza N filas (favoritos + árbol) en paralelo, cada una de un
// proyecto distinto, y cada una necesita reaccionar de forma independiente.
//
// `fallback` (default '/summary', igual que siempre) es lo que se usa
// mientras no haya una "última vista" grabada todavía para ESE proyecto —
// los callers le pasan `defaultViewToRoute(profile.default_view)`
// (0058_profile_preferences.sql) para que la primera visita respete la
// preferencia de la cuenta en vez de ir siempre a /summary.
export function useLastProjectView(
  projectId: string,
  fallback: ProjectViewRoute = '/p/$projectId/summary',
): ProjectViewRoute {
  return useSyncExternalStore(
    subscribe,
    () => readMap()[projectId] ?? fallback,
    () => fallback,
  )
}

// Lectura puntual, sin suscripción — para los pocos lugares que navegan de
// forma imperativa (`navigate(...)` dentro de un `onSelect`, no un `<Link
// to={...}>` en el render) y por eso no pueden llamar al hook de arriba:
// el projectId ahí solo se conoce en el momento del click, no de antemano
// por fila. CommandPalette es el único caso hoy.
export function getLastProjectView(
  projectId: string,
  fallback: ProjectViewRoute = '/p/$projectId/summary',
): ProjectViewRoute {
  return readMap()[projectId] ?? fallback
}
