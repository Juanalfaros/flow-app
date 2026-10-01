import { useSyncExternalStore } from 'react'

export type TaskViewMode = 'side' | 'modal' | 'full'

const KEY = 'flow:task-view-mode'
const EVENT = 'flow:task-view-mode-change'
// Debajo de `md` (768px), el mismo corte que separa la tab bar del sidebar
// de escritorio en AppShell.tsx.
const MOBILE_QUERY = '(max-width: 767.98px)'

function isMobile(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
    mql.removeEventListener('change', callback)
  }
}

function getSnapshot(): TaskViewMode {
  // En mobile SIEMPRE pantalla completa, sin importar la preferencia
  // guardada. Los otros dos modos no existen ahí: 'side' abre un Sheet que
  // igual ocupa el 100% del ancho (ver AppShell.tsx) y 'modal' un diálogo
  // casi a pantalla completa — o sea, tres modos que se ven igual, pero
  // solo 'full' navega a `/p/:id/t/:id`, que es lo que enciende el
  // drill-down de mobile: "atrás" con el nombre de la lista, tab bar
  // escondida y el título grande en el cuerpo. Con el default 'side', todo
  // ese recorrido quedaba apagado salvo que la persona hubiera cambiado la
  // preferencia a mano en escritorio.
  //
  // La preferencia NO se pisa en localStorage: es por dispositivo/ancho, así
  // que quien eligió 'modal' en el escritorio lo conserva ahí.
  if (isMobile()) return 'full'
  const value = localStorage.getItem(KEY)
  return value === 'modal' || value === 'full' ? value : 'side'
}

export function useTaskViewMode(): TaskViewMode {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'side')
}

/** `true` cuando el modo lo impone el ancho y no la preferencia — el
 * selector de modo se esconde ahí en vez de mostrar tres opciones de las
 * que dos no harían nada (ver NodeDetailContent.tsx). */
export function useIsTaskViewModeForced(): boolean {
  return useSyncExternalStore(subscribe, isMobile, () => false)
}

export function setTaskViewMode(mode: TaskViewMode) {
  localStorage.setItem(KEY, mode)
  window.dispatchEvent(new Event(EVENT))
}
