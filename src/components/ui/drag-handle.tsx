import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { cn } from '@/lib/utils'

interface DragHandleProps {
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  /** Qué se arrastra, para el lector de pantalla ("Mover tarea: Diseñar login"). */
  label: string
  className?: string
}

/**
 * Handle de arrastre solo para teclado.
 *
 * El problema que resuelve: DraggableTaskCard, CalendarTaskChip y NodeTreeItem
 * spreadean únicamente `listeners` y NO `attributes`, con un motivo documentado
 * en cada uno — `attributes` agrega role="button" + tabIndex al wrapper, lo que
 * crea un segundo tab-stop delante del <Link> interno y le roba el Enter. La
 * consecuencia es que el drag & drop quedaba accesible solo con puntero: sin
 * `attributes` no hay nada enfocable que el KeyboardSensor pueda activar.
 *
 * En vez de elegir entre "el link no funciona" y "el drag no es accesible", el
 * handle vive en su propio botón: `attributes`+`listeners` van acá, el <Link>
 * conserva su tab-stop, y son dos controles distintos como corresponde.
 *
 * `sr-only focus:not-sr-only` lo mantiene fuera del flujo visual hasta que
 * recibe foco de teclado — los usuarios de mouse no ven ningún cambio.
 */
export function DragHandle({ attributes, listeners, label, className }: DragHandleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'sr-only focus:not-sr-only focus:absolute focus:top-1 focus:right-1 focus:z-10',
        'focus:rounded-md focus:border focus:border-accent focus:bg-surface focus:px-1.5 focus:py-0.5',
        'focus:text-[10px] focus:font-medium focus:text-text',
        className,
      )}
      {...attributes}
      {...listeners}
    >
      Mover
    </button>
  )
}
