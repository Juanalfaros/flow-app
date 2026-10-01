import { KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { KeyboardCoordinateGetter } from '@dnd-kit/core'

// Compartido por Board, Calendario y el árbol del sidebar — cada uno
// declaraba PointerSensor+KeyboardSensor a mano, sin TouchSensor. En touch,
// `PointerSensor` también recibe eventos de puntero táctil, y su
// `activationConstraint: { distance: 4 }` arranca el drag apenas el dedo se
// mueve 4px — antes de que el navegador pueda distinguir "querés scrollear"
// de "querés arrastrar" (R-01, R-08). Un `TouchSensor` con `delay`+
// `tolerance` sí distingue: mantener presionado arrastra, deslizar de
// entrada scrollea — el patrón que la propia documentación de dnd-kit
// recomienda para esto. `coordinateGetter` es opcional: Board/el árbol
// quieren `sortableKeyboardCoordinates` (saltar de ítem a ítem en una
// lista), Calendario quiere el default de dnd-kit (25px libres, porque ahí
// no hay una lista sortable sino una grilla de días).
export function useDragSensors(options?: { coordinateGetter?: KeyboardCoordinateGetter }) {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, options?.coordinateGetter ? { coordinateGetter: options.coordinateGetter } : undefined),
  )
}
