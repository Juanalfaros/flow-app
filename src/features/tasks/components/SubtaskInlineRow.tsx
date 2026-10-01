import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon, Flag01Icon } from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { SubtaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'
import { PRIORITY_TEXT } from '@/features/tasks/priority'
import { STATUS_KIND_BADGE, isDoneStatus } from '@/features/projects/status-kind'
import { formatDeliveryState } from '@/features/tasks/delivery-state'
import { useUpdateSubtaskStatusMutation } from '@/features/tasks/mutations'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'
import { LIST_ROW_GRID_NARROW, LIST_ROW_GRID_WIDE } from '@/features/tasks/components/list-row-grid'

// Subtareas inline en Lista (pedido explícito del usuario, criterio
// ClickUp: "mira cómo muestra incluso las subtareas, con su respectivo
// toggle"). Versión más liviana que TaskRow: una subtarea no tiene
// etiquetas propias ni description preview, y su Estado/Prioridad/Fecha
// no tienen editor inline acá — el checkbox de completar es la única
// acción de verdad, mismo alcance de interacción y mismo `toggle()` que
// ya usa SubtaskList.tsx (el panel de detalle); para el resto, el link
// al título abre su propia tarea. Mismas dos columnas de grid que
// TaskRow.tsx (list-row-grid.ts) para que quede alineada con las filas
// de arriba.
interface SubtaskInlineRowProps {
  subtask: SubtaskSummary
  projectId: string
  parentId: string
  statuses: StatusSummary[]
}

export function SubtaskInlineRow({ subtask, projectId, parentId, statuses }: SubtaskInlineRowProps) {
  const updateStatusMutation = useUpdateSubtaskStatusMutation(parentId)
  const isDone = isDoneStatus(subtask.status?.status_kind)
  const dueDate = formatDeliveryState(subtask.due_date, isDone, null)

  function toggleDone() {
    const doneStatus = statuses.find((s) => s.status_kind === 'success')
    const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0]
    const target = isDone ? defaultStatus : doneStatus
    if (!target) return
    updateStatusMutation.mutate({
      taskId: subtask.id,
      status: { id: target.id, name: target.name, status_kind: target.status_kind },
    })
  }

  return (
    <div
      className={cn(
        // `min-h-11` + checkbox más grande en angosto: mismo criterio que
        // TaskRow.tsx (la subtarea se toca con el mismo dedo que la tarea).
        'grid min-h-11 items-center gap-3 rounded-md py-1 pr-2 pl-6 text-sm text-text-secondary transition-colors hover:bg-surface-alt @min-[640px]:min-h-0',
        LIST_ROW_GRID_NARROW,
        LIST_ROW_GRID_WIDE,
      )}
    >
      <Checkbox
        checked={isDone}
        aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
        onCheckedChange={toggleDone}
        className="size-5 after:-inset-y-3 @min-[640px]:size-4 @min-[640px]:after:-inset-y-2"
      />
      <div className="flex min-w-0 items-center gap-1.5">
        <Link
          to="/p/$projectId/t/$taskId"
          params={{ projectId, taskId: subtask.id }}
          className={cn('min-w-0 truncate hover:underline', isDone && 'text-text-muted line-through')}
        >
          {subtask.title}
        </Link>
      </div>
      <span className="hidden @min-[640px]:flex">
        {subtask.assignee ? (
          <Avatar size="sm">
            {subtask.assignee.avatar_url && <AvatarImage src={subtask.assignee.avatar_url} alt="" />}
            <AvatarFallback>{initials(subtask.assignee.full_name)}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="size-6" />
        )}
      </span>
      <span className="hidden items-center gap-1 text-xs text-text-muted @min-[640px]:flex">
        {dueDate && <HugeiconsIcon icon={Calendar01Icon} className="size-3" />}
        {dueDate?.label ?? '—'}
      </span>
      <span className="hidden @min-[640px]:flex">
        <HugeiconsIcon icon={Flag01Icon} className={cn('size-3', PRIORITY_TEXT[subtask.priority])} />
      </span>
      {subtask.status && (
        <span
          className={cn(
            'w-fit rounded-full px-2 py-0.5 text-xs font-medium',
            STATUS_KIND_BADGE[subtask.status.status_kind],
          )}
        >
          {subtask.status.name}
        </span>
      )}
    </div>
  )
}
