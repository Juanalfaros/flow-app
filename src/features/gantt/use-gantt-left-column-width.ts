import { useSyncExternalStore } from 'react'
import { LEFT_COLUMN_WIDTH } from '@/features/gantt/gantt-layout'

const MOBILE_LEFT_COLUMN_WIDTH = 140
const QUERY = '(max-width: 639px)'

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): number {
  return window.matchMedia(QUERY).matches ? MOBILE_LEFT_COLUMN_WIDTH : LEFT_COLUMN_WIDTH
}

// La columna sticky de labels a 240px (LEFT_COLUMN_WIDTH) se come dos
// tercios de un viewport de ~360px antes de llegar a la primera columna de
// fecha. Reduce a 140px bajo 640px de ancho — no se toca PX_PER_DAY (ancho
// de columna de día): reducirlo degradaría la precisión del drag y la
// legibilidad de las fechas.
export function useGanttLeftColumnWidth(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => LEFT_COLUMN_WIDTH)
}
