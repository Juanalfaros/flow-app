import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/initials'
import { PRIORITY_DOT, PRIORITY_LABEL } from '@/features/tasks/priority'
import { useTaskViewMode } from '@/features/nodes/task-view-mode'
import { useSetNodeSearchParam } from '@/lib/node-param'
import type { MyTaskRow } from '@/features/tasks/queries'
import { formatDeliveryState, type DeliveryState } from '@/features/tasks/delivery-state'
import { isDoneStatus } from '@/features/projects/status-kind'
import { cn } from '@/lib/utils'

// Mismo comentario que TaskCard.tsx: 'overdue' alarma, 'late' es
// histórico (ya entregada, solo tarde) — antes de esto MyWorkWidget
// mostraba tareas Hechas en su propia pestaña "Hecho" con "Venció hace
// N días" en rojo, sin distinguir.
const DUE_DATE_STATE_CLASS: Record<DeliveryState, string> = {
  overdue: 'text-danger-text',
  today: 'text-accent-2-text-on-bg',
  upcoming: 'text-text-muted',
  ontime: 'text-text-muted',
  late: 'text-accent-2-text-on-bg',
}

interface MyTaskListItemProps {
  task: MyTaskRow
  projectName: string | undefined
  /** Tab "Delegado" de MyWorkWidget: muestra a quién se delegó en vez
   * del chip de proyecto — ambos comparten fila para no forkear el
   * componente por una sola diferencia visual. */
  showAssignee?: boolean
  /** Slot a la derecha del título — hoy solo lo usa MyWorkWidget para el
   * toggle de fijar como prioridad (FavoriteButton). */
  action?: ReactNode
}

export function MyTaskListItem({ task, projectName, showAssignee, action }: MyTaskListItemProps) {
  const viewMode = useTaskViewMode()
  const setNode = useSetNodeSearchParam()
  const dueDate = formatDeliveryState(task.due_date, isDoneStatus(task.status?.status_kind), task.completed_at)

  return (
    <div className="flex min-h-11 flex-col justify-center gap-1 rounded-md px-2 py-1.5 transition-colors active:bg-surface-alt hover:bg-surface-alt">
      <div className="flex min-w-0 items-center gap-1.5">
        {task.projectId ? (
          <Link
            to="/p/$projectId/t/$taskId"
            params={{ projectId: task.projectId, taskId: task.id }}
            onClick={(e) => {
              if (viewMode === 'side' || viewMode === 'modal') {
                e.preventDefault()
                setNode(task.id)
              }
            }}
            className="min-w-0 truncate text-sm hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {task.title}
          </Link>
        ) : (
          // Sin projectId: es una tarea personal (Lista personal), sin
          // ruta `/p/:id/t/:id` a la que ir — antes esto era un <span>
          // sin ningún manejador de click, así que una tarea personal
          // asignada a Mi trabajo no se podía ni abrir ni borrar desde
          // acá. `setNode` (el mismo mecanismo que ya abre el Sheet/
          // Dialog de detalle) siempre está disponible, con o sin
          // proyecto. Reportado por el usuario.
          <button
            type="button"
            onClick={() => setNode(task.id)}
            className="min-w-0 truncate text-left text-sm hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {task.title}
          </button>
        )}
        {action && <span className="ml-auto shrink-0">{action}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        {showAssignee ? (
          task.assignee && (
            <span className="flex items-center gap-1.5">
              <Avatar size="sm">
                {task.assignee.avatar_url && <AvatarImage src={task.assignee.avatar_url} alt="" />}
                <AvatarFallback>{initials(task.assignee.full_name)}</AvatarFallback>
              </Avatar>
              {task.assignee.full_name}
            </span>
          )
        ) : (
          projectName && <span className="truncate rounded-full bg-surface-alt px-1.5 py-0.5">{projectName}</span>
        )}
        <span className="flex items-center gap-1">
          <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[task.priority])} />
          {PRIORITY_LABEL[task.priority] ?? task.priority}
        </span>
        {dueDate && (
          <span className={cn('flex items-center gap-1', DUE_DATE_STATE_CLASS[dueDate.state])}>
            <HugeiconsIcon icon={Calendar01Icon} className="size-3" />
            {dueDate.label}
          </span>
        )}
        {task.task_labels.map(({ label }) => (
          <span
            key={label.id}
            className="max-w-[7rem] truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: label.color ?? undefined }}
          >
            {label.name}
          </span>
        ))}
      </div>
    </div>
  )
}
