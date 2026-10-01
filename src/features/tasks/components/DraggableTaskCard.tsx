import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DragHandle } from '@/components/ui/drag-handle'
import { TaskCard } from '@/features/tasks/components/TaskCard'
import type { TaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'
import { cn } from '@/lib/utils'

interface DraggableTaskCardProps {
  task: TaskSummary
  projectId: string
  selected?: boolean
  statuses: StatusSummary[]
  allTasks: TaskSummary[]
}

export function DraggableTaskCard({ task, projectId, selected, statuses, allTasks }: DraggableTaskCardProps) {
  // El wrapper recibe solo `listeners` (drag por puntero), nunca `attributes`:
  // éstas agregan role="button"/tabIndex, creando un segundo tab-stop delante
  // del <Link> de TaskCard y capturando el Enter en vez de dejarlo navegar.
  // `attributes` va en el DragHandle, que es su propio botón — así el link
  // conserva su foco y el drag pasa a ser operable por teclado (antes solo
  // existía con puntero, porque sin `attributes` el KeyboardSensor no tiene
  // nada que activar).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      // `touch-none` sólo mientras arrastra (antes fijo): con
      // `touch-action: none` permanente, el navegador nunca deja
      // scrollear la columna con el dedo, sin importar el `delay` del
      // TouchSensor — ese delay solo pausa cuándo dnd-kit decide que es
      // un drag, no cuándo el navegador puede scrollear (R-01).
      className={cn('relative', isDragging && 'touch-none opacity-50')}
      {...listeners}
    >
      <DragHandle attributes={attributes} listeners={listeners} label={`Mover tarea: ${task.title}`} />
      <TaskCard task={task} projectId={projectId} selected={selected} statuses={statuses} allTasks={allTasks} />
    </div>
  )
}
