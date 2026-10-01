import { Link } from '@tanstack/react-router'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { HugeiconsIcon } from '@hugeicons/react'
import { RepeatIcon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DragHandle } from '@/components/ui/drag-handle'
import type { TaskSummary } from '@/features/tasks/queries'
import { PRIORITY_DOT, PRIORITY_LABEL } from '@/features/tasks/priority'
import { useTaskViewMode } from '@/features/nodes/task-view-mode'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { projectColor } from '@/features/nodes/project-color'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/initials'

interface CalendarTaskChipProps {
  task: TaskSummary
  /** S-06: punto de color por proyecto en el borde izquierdo — sin
   * distinguir de un vistazo "esto es de qué lista", cruzar proyectos en
   * el calendario global no aporta nada sobre mirarlos por separado. Solo
   * tiene sentido prenderlo cuando de verdad hay más de un proyecto a la
   * vista (el calendario de un solo proyecto no lo usa). */
  showProjectColor?: boolean
}

// Chip compacto compartido por Mes/Semana/Día — drag source (useDraggable,
// sin orden dentro del día a diferencia de DraggableTaskCard/useSortable
// del board) + mismo click-to-open que TaskCard/TaskRow. Igual que
// DraggableTaskCard: el drag va en un wrapper aparte (solo `listeners`,
// sin `attributes`) para no pisar el foco/tab-stop del <Link> de adentro,
// y `attributes` va en el DragHandle para que reprogramar una tarea también
// se pueda hacer con teclado.
export function CalendarTaskChip({ task, showProjectColor }: CalendarTaskChipProps) {
  const viewMode = useTaskViewMode()
  const setNode = useSetNodeSearchParam()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      // `touch-none` sólo mientras arrastra — ver el mismo comentario en
      // DraggableTaskCard.tsx (R-01).
      className={cn('relative', isDragging && 'touch-none opacity-40')}
      {...listeners}
    >
      <DragHandle attributes={attributes} listeners={listeners} label={`Reprogramar tarea: ${task.title}`} />
      {/* `task.container_id` en vez de un `projectId` recibido por prop
          (S-06): antes venía de la página, que asumía un solo proyecto
          para todo el calendario — en el calendario global cada tarea
          puede ser de uno distinto, y este dato ya vive en la tarea. */}
      <Link
        id={`task-${task.id}`}
        to="/p/$projectId/t/$taskId"
        params={{ projectId: task.container_id, taskId: task.id }}
        onClick={(e) => {
          if (viewMode === 'side' || viewMode === 'modal') {
            e.preventDefault()
            setNode(task.id)
          }
        }}
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-border/60 bg-surface px-1.5 py-1 text-xs shadow-sm transition-colors hover:border-border hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-accent',
          // Ancho del borde izquierdo nada más — el color lo pisa el
          // inline style de abajo (mayor especificidad que la clase de
          // color de arriba, sin pelearse por el merge de tailwind-merge).
          showProjectColor && 'border-l-[3px]',
        )}
        style={showProjectColor ? { borderLeftColor: projectColor(task.container_id) } : undefined}
      >
        <span
          className={cn('size-1.5 shrink-0 rounded-full', PRIORITY_DOT[task.priority])}
          title={PRIORITY_LABEL[task.priority] ?? task.priority}
        />
        <span className="min-w-0 flex-1 truncate text-text">{task.title}</span>
        {task.has_recurrence && (
          <span title="Tarea recurrente">
            <HugeiconsIcon icon={RepeatIcon} className="size-3 shrink-0 text-text-muted" />
          </span>
        )}
        {task.assignee && (
          <Avatar size="sm" className="size-4 shrink-0">
            {task.assignee.avatar_url && <AvatarImage src={task.assignee.avatar_url} alt="" />}
            <AvatarFallback className="text-[9px]">{initials(task.assignee.full_name)}</AvatarFallback>
          </Avatar>
        )}
      </Link>
    </div>
  )
}
