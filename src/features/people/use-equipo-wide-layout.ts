import { useSyncExternalStore } from 'react'

// Umbral compartido por las dos decisiones de ancho del rediseño de Equipo
// (maqueta: https://claude.ai/artifact/6B28WSrkGgAN2tRkH7UGyX) — la ficha
// de persona al lado de la lista (route.tsx) y el árbol del organigrama
// (organigrama.tsx) piden el mismo punto de corte: "@min-[1100px]" de
// ANCHO DE CONTENIDO. Mismo trade-off que use-inbox-split-pane.ts: el
// corte real que importa es el contenedor, no la ventana, pero acá decide
// qué se MONTA (Sheet vs. columna, lista vs. árbol), no solo estética, así
// que hace falta JS con `matchMedia` sobre la ventana, no una variante de
// contenedor en CSS.
//
// 1420px de ventana, no 1100px: el riel+panel del sidebar ocupan 318px
// expandido (mismo número ya documentado en use-inbox-split-pane.ts) —
// 1420-318=1102, arriba del piso real incluso con el sidebar expandido.
const WIDE_QUERY = '(min-width: 1420px)'

function getSnapshot(): boolean {
  return window.matchMedia(WIDE_QUERY).matches
}

function subscribe(callback: () => void) {
  const mql = window.matchMedia(WIDE_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

export function useEquipoWideLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
