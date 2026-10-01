import { useEffect, useRef, useState } from 'react'
import { addDays } from 'date-fns'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { DragDropVerticalIcon } from '@hugeicons/core-free-icons'
import { toDateKey } from '@/features/calendar/date-utils'
import {
  chartWidth,
  computeDateRange,
  dateToX,
  getScheduledTasks,
  getUnscheduledTasks,
  xToDayOffset,
  ROW_HEIGHT,
  ZOOM_LABEL,
  ZOOM_PX_PER_DAY,
  type GanttZoom,
} from '@/features/gantt/gantt-layout'
import { useGanttLeftColumnWidth } from '@/features/gantt/use-gantt-left-column-width'
import { GanttHeader } from '@/features/gantt/components/GanttHeader'
import { GanttRow, type BarDragMode } from '@/features/gantt/components/GanttRow'
import { GanttDependencyLayer } from '@/features/gantt/components/GanttDependencyLayer'
import { useTaskDependencies } from '@/features/tasks/dependencies/queries'
import { useAddDependencyMutation, useRemoveDependencyMutation } from '@/features/tasks/dependencies/mutations'
import { useUpdateTaskScheduleMutation } from '@/features/tasks/mutations'
import type { TaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'
import { STATUS_KIND_BADGE } from '@/features/projects/status-kind'
import { cn } from '@/lib/utils'

interface GanttChartProps {
  /** S-06: en el Timeline global (varios proyectos a la vez) ya no
   * identifica "el" proyecto de cada tarea — eso ahora sale de
   * `task.container_id` en GanttRow.tsx. Acá solo lo sigue necesitando
   * `useUpdateTaskScheduleMutation` para armar su prefijo de query key
   * (ver el hook): el UPDATE real es por `taskId`, no le importa cuál se
   * pase — así que en el Timeline global basta con cualquier id válido
   * (se usa el del primer proyecto en pantalla) y `onScheduleChanged` de
   * abajo hace el trabajo real de refrescar la vista. */
  projectId: string
  tasks: TaskSummary[]
  statuses: StatusSummary[]
  /** S-06: se llama después de reprogramar una tarea (mover/redimensionar
   * la barra, o arrastrarla desde "Sin programar"). El Timeline por
   * proyecto no lo necesita (su propia query ya se actualiza sola vía el
   * cache-patch de la mutación); el global sí, porque lee de
   * `useSubtreeTasks` — un cache distinto que esa mutación no toca. */
  onScheduleChanged?: () => void
  /** S-06: color por proyecto en el borde de cada fila — ver GanttRow.tsx. */
  showProjectColor?: boolean
}

type BarDrag = {
  kind: 'bar'
  mode: BarDragMode
  taskId: string
  originClientX: number
  originStart: Date
  originEnd: Date
  previewStart: Date
  previewEnd: Date
}
type ConnectDrag = { kind: 'connect'; fromTaskId: string; x: number; y: number }
// Arrastrar una tarjeta desde la bandeja de "sin programar" hacia el
// gráfico — un cuarto origen de drag sobre la misma máquina de estados
// que ya maneja mover/redimensionar/conectar (pointer events nativos, sin
// dnd-kit): `previewDate` es `null` mientras el puntero está afuera del
// área de fechas válida, y se resuelve a un día concreto cuando entra.
type ScheduleDrag = { kind: 'schedule'; taskId: string; previewDate: Date | null }
type DragState = BarDrag | ConnectDrag | ScheduleDrag | null

const ZOOM_LEVELS: GanttZoom[] = ['day', 'week', 'month']

export function GanttChart({ projectId, tasks, statuses, onScheduleChanged, showProjectColor }: GanttChartProps) {
  const rowsAreaRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [zoom, setZoom] = useState<GanttZoom>('day')
  const leftColumnWidth = useGanttLeftColumnWidth()
  const pxPerDay = ZOOM_PX_PER_DAY[zoom]

  const scheduled = getScheduledTasks(tasks)
  const unscheduled = getUnscheduledTasks(tasks)
  const range = computeDateRange(scheduled)
  const width = chartWidth(range, pxPerDay)
  const taskIds = scheduled.map((r) => r.task.id)

  const { data: dependencies } = useTaskDependencies(taskIds)
  const addDepMutation = useAddDependencyMutation(taskIds)
  const removeDepMutation = useRemoveDependencyMutation(taskIds)
  const scheduleMutation = useUpdateTaskScheduleMutation(projectId)

  function handleBarPointerDown(e: React.PointerEvent, taskId: string, mode: BarDragMode) {
    const r = scheduled.find((r) => r.task.id === taskId)
    if (!r) return
    e.preventDefault()
    setDrag({
      kind: 'bar',
      mode,
      taskId,
      originClientX: e.clientX,
      originStart: r.start,
      originEnd: r.end,
      previewStart: r.start,
      previewEnd: r.end,
    })
  }

  function handleConnectorPointerDown(e: React.PointerEvent, taskId: string) {
    e.preventDefault()
    e.stopPropagation()
    const rect = rowsAreaRef.current?.getBoundingClientRect()
    if (!rect) return
    setDrag({ kind: 'connect', fromTaskId: taskId, x: e.clientX - rect.left - leftColumnWidth, y: e.clientY - rect.top })
  }

  function handleTrayPointerDown(e: React.PointerEvent, taskId: string) {
    e.preventDefault()
    setDrag({ kind: 'schedule', taskId, previewDate: null })
  }

  const isDragging = drag !== null
  useEffect(() => {
    if (!isDragging) return

    function onMove(e: PointerEvent) {
      setDrag((prev) => {
        if (!prev) return prev
        if (prev.kind === 'connect') {
          const rect = rowsAreaRef.current?.getBoundingClientRect()
          if (!rect) return prev
          return { ...prev, x: e.clientX - rect.left - leftColumnWidth, y: e.clientY - rect.top }
        }
        if (prev.kind === 'schedule') {
          const rect = rowsAreaRef.current?.getBoundingClientRect()
          if (!rect) return prev
          const localX = e.clientX - rect.left - leftColumnWidth
          const localY = e.clientY - rect.top
          const inBounds = localX >= 0 && localX <= width && localY >= 0 && localY <= rect.height
          if (!inBounds) return { ...prev, previewDate: null }
          return { ...prev, previewDate: addDays(range.start, xToDayOffset(localX, pxPerDay)) }
        }
        const dayDelta = xToDayOffset(e.clientX - prev.originClientX, pxPerDay)
        if (prev.mode === 'move') {
          return { ...prev, previewStart: addDays(prev.originStart, dayDelta), previewEnd: addDays(prev.originEnd, dayDelta) }
        }
        if (prev.mode === 'resize-start') {
          const next = addDays(prev.originStart, dayDelta)
          return { ...prev, previewStart: next > prev.previewEnd ? prev.previewEnd : next }
        }
        const next = addDays(prev.originEnd, dayDelta)
        return { ...prev, previewEnd: next < prev.previewStart ? prev.previewStart : next }
      })
    }

    function onUp(e: PointerEvent) {
      setDrag((prev) => {
        if (!prev) return null
        if (prev.kind === 'connect') {
          const targetEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
            '[data-task-id]',
          ) as HTMLElement | null
          const targetId = targetEl?.dataset.taskId
          if (targetId && targetId !== prev.fromTaskId) {
            addDepMutation.mutate(
              { predecessorId: prev.fromTaskId, successorId: targetId },
              { onError: () => toast.error('No se pudo crear la dependencia (¿generaría un ciclo?).') },
            )
          }
          return null
        }
        if (prev.kind === 'schedule') {
          if (prev.previewDate) {
            const key = toDateKey(prev.previewDate)
            scheduleMutation.mutate(
              { taskId: prev.taskId, startDate: key, dueDate: key },
              { onSuccess: onScheduleChanged },
            )
          }
          return null
        }
        const changed =
          prev.previewStart.getTime() !== prev.originStart.getTime() ||
          prev.previewEnd.getTime() !== prev.originEnd.getTime()
        if (changed) {
          scheduleMutation.mutate(
            {
              taskId: prev.taskId,
              startDate: prev.mode === 'resize-end' ? undefined : toDateKey(prev.previewStart),
              dueDate: prev.mode === 'resize-start' ? undefined : toDateKey(prev.previewEnd),
            },
            { onSuccess: onScheduleChanged },
          )
        }
        return null
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // Deliberado: solo re-suscribe al iniciar/terminar un drag o al cambiar
    // de zoom (no en cada actualización de preview) — los handlers leen
    // estado fresco vía la forma funcional de `setDrag`, no necesitan
    // `drag`/`range`/`width` en las deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, pxPerDay])

  const hasAnything = scheduled.length > 0 || unscheduled.length > 0
  if (!hasAnything) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-card border border-dashed border-border bg-surface py-10 text-center">
        <p className="text-sm text-text-muted">Ninguna tarea tiene fecha todavía.</p>
      </div>
    )
  }

  const todayX = dateToX(new Date(), range.start, pxPerDay)
  const showToday = todayX >= 0 && todayX <= width

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-0.5 rounded-md bg-surface-alt p-0.5 text-xs">
          {ZOOM_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoom(level)}
              className={cn(
                'rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1 text-text-muted transition-colors hover:text-text',
                zoom === level && 'bg-bg text-text shadow-sm',
              )}
            >
              {ZOOM_LABEL[level]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
          {statuses.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-sm', STATUS_KIND_BADGE[s.status_kind])} />
              {s.name}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-danger-bg ring-1 ring-danger/60" />
            Vencida
          </span>
        </div>
      </div>

      {scheduled.length > 0 && (
        <div className="scroll-x-list overflow-x-auto rounded-card border border-border/60 bg-surface shadow-card">
          <div style={{ width: leftColumnWidth + width }}>
            <GanttHeader range={range} pxPerDay={pxPerDay} />
            <div ref={rowsAreaRef} className="relative" style={{ height: scheduled.length * ROW_HEIGHT }}>
              {scheduled.map((r) => (
                <GanttRow
                  key={r.task.id}
                  range={r}
                  chartStart={range.start}
                  pxPerDay={pxPerDay}
                  statuses={statuses}
                  preview={drag?.kind === 'bar' && drag.taskId === r.task.id ? { start: drag.previewStart, end: drag.previewEnd } : undefined}
                  onBarPointerDown={handleBarPointerDown}
                  onConnectorPointerDown={handleConnectorPointerDown}
                  showProjectColor={showProjectColor}
                />
              ))}
              <div className="pointer-events-none absolute top-0" style={{ left: leftColumnWidth }}>
                <GanttDependencyLayer
                  dependencies={dependencies ?? []}
                  scheduled={scheduled}
                  chartStart={range.start}
                  pxPerDay={pxPerDay}
                  width={width}
                  tempConnector={drag?.kind === 'connect' ? drag : null}
                  onRemove={(id) =>
                    removeDepMutation.mutate(id, { onError: () => toast.error('No se pudo eliminar la dependencia.') })
                  }
                />
              </div>
              {showToday && (
                <div
                  className="pointer-events-none absolute top-0 w-px bg-danger/50"
                  style={{ left: leftColumnWidth + todayX + pxPerDay / 2, height: scheduled.length * ROW_HEIGHT }}
                />
              )}
              {drag?.kind === 'schedule' && drag.previewDate && (
                <div
                  className="pointer-events-none absolute top-0 rounded-sm bg-accent/20 ring-1 ring-accent"
                  style={{
                    left: leftColumnWidth + dateToX(drag.previewDate, range.start, pxPerDay),
                    width: pxPerDay,
                    height: scheduled.length * ROW_HEIGHT,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="rounded-card border border-dashed border-border p-3">
          <h3 className="mb-0.5 text-xs font-semibold text-text-muted">Sin programar · {unscheduled.length}</h3>
          <p className="mb-2.5 text-[11px] text-text-muted">
            Arrastra una tarjeta al gráfico para darle fecha, o ábrela y asígnala desde el detalle.
          </p>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((task) => (
              <div
                key={task.id}
                onPointerDown={(e) => handleTrayPointerDown(e, task.id)}
                className={cn(
                  'flex touch-none items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text',
                  'cursor-grab select-none active:cursor-grabbing',
                  drag?.kind === 'schedule' && drag.taskId === task.id && 'opacity-40',
                )}
              >
                <HugeiconsIcon icon={DragDropVerticalIcon} className="size-3.5 shrink-0 text-text-muted" />
                {task.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
