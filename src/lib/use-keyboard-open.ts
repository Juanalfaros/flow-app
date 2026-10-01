import { useSyncExternalStore } from 'react'

// "El teclado tapa, no empuja" (Fase 2 del rediseño de navegación,
// auditado como hueco real de plataforma): en una PWA `standalone`, el
// teclado en pantalla no reduce el viewport de layout (`window.innerHeight`
// se mantiene igual) — solo `visualViewport` se achica. Sin esto, la tab
// bar fija queda flotando ARRIBA del teclado, tapando el último campo de
// texto visible en vez de esconderse. Umbral 75%: un teclado real (con
// autocompletado/sugerencias) se come bastante más que un simple cambio de
// orientación o una barra de direcciones que aparece/desaparece.
const KEYBOARD_HEIGHT_RATIO_THRESHOLD = 0.75

function getSnapshot(): boolean {
  const vv = window.visualViewport
  if (!vv) return false
  return vv.height < window.innerHeight * KEYBOARD_HEIGHT_RATIO_THRESHOLD
}

function subscribe(callback: () => void) {
  const vv = window.visualViewport
  if (!vv) return () => {}
  vv.addEventListener('resize', callback)
  return () => vv.removeEventListener('resize', callback)
}

export function useIsKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
