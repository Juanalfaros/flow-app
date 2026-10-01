import { isBefore, parseISO, startOfDay } from 'date-fns'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Diamond01Icon, RepeatIcon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/components/ui/avatar'
import { PRIORITY_DOT } from '@/features/tasks/priority'
import { STATUS_KIND_BADGE, STATUS_KIND_DOT, isDoneStatus } from '@/features/projects/status-kind'
import type { StatusSummary } from '@/features/projects/queries'
import type { TaskRange } from '@/features/gantt/gantt-layout'
import { dateToX, ROW_HEIGHT } from '@/features/gantt/gantt-layout'
import { useGanttLeftColumnWidth } from '@/features/gantt/use-gantt-left-column-width'
import { useTaskViewMode } from '@/features/nodes/task-view-mode'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { projectColor } from '@/features/nodes/project-color'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/initials'

export type BarDragMode = 'move' | 'resize-start' | 'resize-end'

interface GanttRowProps {
  range: TaskRange
  chartStart: Date
  pxPerDay: number
  statuses: StatusSummary[]
  preview?: { start: Date; end: Date }
  onBarPointerDown: (e: React.PointerEvent, taskId: string, mode: BarDragMode) => void
  onConnectorPointerDown: (e: React.PointerEvent, taskId: string) => void
  /** S-06: punto de color por proyecto en el borde de la barra — ver
   * CalendarTaskChip.tsx (mismo criterio). */
  showProjectColor?: boolean
}

// Fila: celda de info (sticky, izquierda) + barra/hito posicionado
// absoluto sobre el eje de fechas (derecha). El drag (mover/redimensionar/
// conectar) lo coordina GanttChart (necesita saber sobre qué fila cae el
// puntero al conectar) — acá solo se disparan los callbacks en
// `onPointerDown`.
export function GanttRow({
  range,
  chartStart,
  pxPerDay,
  statuses,
  preview,
  onBarPointerDown,
  onConnectorPointerDown,
  showProjectColor,
}: GanttRowProps) {
  const viewMode = useTaskViewMode()
  const setNode = useSetNodeSearchParam()
  const leftColumnWidth = useGanttLeftColumnWidth()
  const { task } = range
  const start = preview?.start ?? range.start
  const end = preview?.end ?? range.end
  const status = statuses.find((s) => s.id === task.status_id)

  const left = dateToX(start, chartStart, pxPerDay)
  const width = Math.max(pxPerDay, dateToX(end, chartStart, pxPerDay) - left + pxPerDay)

  // Bordes/relleno reusan STATUS_KIND_BADGE tal cual — mismo color que ya
  // ve el usuario en Board y Lista, no un sistema nuevo. "Vencida" es la
  // única categoría que no viene de `status_kind`: se deriva acá
  // comparando `due_date` contra hoy, igual que TaskCard/TaskRow.
  const isDone = isDoneStatus(status?.status_kind)
  const isOverdue = !isDone && !!task.due_date && isBefore(parseISO(task.due_date), startOfDay(new Date()))
  const barToneClass = isOverdue
    ? 'bg-danger-bg text-danger-text ring-1 ring-danger/60'
    : status
      ? cn(STATUS_KIND_BADGE[status.status_kind], 'ring-1 ring-inset ring-black/10 dark:ring-white/10')
      : 'bg-accent-soft text-accent-text-on-bg ring-1 ring-accent/40'

  return (
    <div
      data-task-id={task.id}
      className="group/row relative flex border-b border-border/60"
      style={{ height: ROW_HEIGHT }}
    >
      <div
        className={cn(
          'sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border/60 bg-surface px-2',
          showProjectColor && 'border-l-[3px]',
        )}
        style={{
          width: leftColumnWidth,
          ...(showProjectColor ? { borderLeftColor: projectColor(task.container_id) } : {}),
        }}
      >
        {status && <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_KIND_DOT[status.status_kind])} />}
        <Link
          to="/p/$projectId/t/$taskId"
          params={{ projectId: task.container_id, taskId: task.id }}
          onClick={(e) => {
            if (viewMode === 'side' || viewMode === 'modal') {
              e.preventDefault()
              setNode(task.id)
            }
          }}
          className="min-w-0 flex-1 truncate text-xs text-text hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {task.title}
        </Link>
        {task.has_recurrence && (
          <span title="Tarea recurrente">
            <HugeiconsIcon icon={RepeatIcon} className="size-3 shrink-0 text-text-muted" />
          </span>
        )}
        {task.task_assignees.length > 0 && (
          <AvatarGroup className="shrink-0 -space-x-1">
            {task.task_assignees.slice(0, 2).map((a) => (
              <Avatar key={a.user_id} size="sm" className="size-4">
                {a.assignee?.avatar_url && <AvatarImage src={a.assignee.avatar_url} alt="" />}
                <AvatarFallback className="text-[9px]">{initials(a.assignee?.full_name)}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        )}
      </div>

      <div className="relative flex-1">
        {task.is_milestone ? (
          <button
            type="button"
            onPointerDown={(e) => onBarPointerDown(e, task.id, 'move')}
            className="absolute top-1/2 flex size-3.5 -translate-y-1/2 touch-none items-center justify-center rounded-[3px] bg-accent-2 text-accent-2-text-on-bg shadow-sm"
            style={{ left: left + pxPerDay / 2 - 7 }}
            title={task.title}
          >
            <HugeiconsIcon icon={Diamond01Icon} className="size-2.5" />
          </button>
        ) : (
          <div
            className={cn('absolute top-1.5 flex touch-none items-center rounded-md', barToneClass)}
            style={{ left, width, height: ROW_HEIGHT - 12 }}
          >
            <button
              type="button"
              onPointerDown={(e) => onBarPointerDown(e, task.id, 'resize-start')}
              // `after:` crece el área de toque hacia afuera (6px visibles
              // + 8px extra a la izquierda) sin invadir el botón "mover"
              // de al lado — auditoría mobile: 6px solos son difíciles de
              // acertar con el dedo.
              className="relative h-full w-1.5 shrink-0 cursor-ew-resize after:absolute after:inset-y-0 after:-left-2 after:right-0"
              aria-label="Cambiar fecha de inicio"
            />
            <button
              type="button"
              onPointerDown={(e) => onBarPointerDown(e, task.id, 'move')}
              className="flex h-full min-w-0 flex-1 cursor-grab items-center px-1 text-left text-[11px] active:cursor-grabbing"
            >
              <span className="flex items-center gap-1 truncate">
                <span className={cn('size-1 shrink-0 rounded-full', PRIORITY_DOT[task.priority])} />
                <span className="truncate">
                  {isDone && '✓ '}
                  {task.title}
                </span>
              </span>
            </button>
            <button
              type="button"
              onPointerDown={(e) => onBarPointerDown(e, task.id, 'resize-end')}
              className="relative h-full w-1.5 shrink-0 cursor-ew-resize after:absolute after:inset-y-0 after:left-0 after:-right-2"
              aria-label="Cambiar fecha de fin"
            />
            <button
              type="button"
              onPointerDown={(e) => onConnectorPointerDown(e, task.id)}
              // Visible siempre en touch (sin hover no hay forma de
              // descubrirlo): `[@media(hover:none)]` — auditoría mobile,
              // el mouse conserva el reveal-on-hover de siempre. `after:`
              // agranda el área de toque de los 10px visibles a ~26px.
              className="absolute top-1/2 -right-1.5 size-2.5 -translate-y-1/2 touch-none rounded-full border border-accent bg-surface opacity-0 after:absolute after:-inset-2 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100"
              aria-label="Crear dependencia"
              title="Arrastrar a otra tarea para crear una dependencia"
            />
          </div>
        )}
      </div>
    </div>
  )
}
