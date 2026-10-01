import { useState } from 'react'
import { differenceInCalendarDays, format, isSameMonth, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useDroppable } from '@dnd-kit/core'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { CalendarTaskChip } from '@/features/calendar/components/CalendarTaskChip'
import { getMonthGrid, fromDateKey, toDateKey, type WeekDays } from '@/features/calendar/date-utils'
import type { TaskSummary } from '@/features/tasks/queries'
import { cn } from '@/lib/utils'

const MAX_VISIBLE = 3

interface MonthViewProps {
  anchorDate: Date
  tasksByDate: Map<string, TaskSummary[]>
  /** Tareas con `start_date` distinto de `due_date` — se dibujan como
   * barra de rango en la fila de su semana en vez de chip en un día. */
  rangedTasks: (TaskSummary & { start_date: string; due_date: string })[]
  /** Omitido (S-06, calendario global): no hay un proyecto único al que
   * asignarle una tarea nueva creada desde una celda — el "+" de cada día
   * se oculta en vez de forzar a elegir uno. */
  onCreateTask?: (dateKey: string, title: string) => void
  onOpenDay: (date: Date) => void
  /** S-06: chips con borde de color por proyecto — ver CalendarTaskChip.tsx. */
  showProjectColor?: boolean
}

export function MonthView({
  anchorDate,
  tasksByDate,
  rangedTasks,
  onCreateTask,
  onOpenDay,
  showProjectColor,
}: MonthViewProps) {
  const weeks = getMonthGrid(anchorDate)
  const [addingKey, setAddingKey] = useState<string | null>(null)

  return (
    <div className="no-scrollbar overflow-x-auto rounded-card border border-border/60 bg-surface shadow-card">
      {/* min-w-[560px]: en mobile, en vez de aplastar las 7 columnas a un
          ancho ilegible, se hace scroll horizontal manteniendo cada celda
          en un tamaño usable. */}
      <div className="flex min-w-[560px] flex-col">
        <div className="grid grid-cols-7 border-b border-border/60">
          {weeks[0].map((day) => (
            <div key={day.toISOString()} className="p-1.5 text-center text-xs font-medium text-text-muted">
              {format(day, 'EEEEEE', { locale: es })}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <MonthWeekRow
            key={week[0].toISOString()}
            week={week}
            anchorDate={anchorDate}
            tasksByDate={tasksByDate}
            rangedTasks={rangedTasks}
            addingKey={addingKey}
            onStartAdd={onCreateTask && setAddingKey}
            onSubmitAdd={
              onCreateTask &&
              ((dateKey, title) => {
                onCreateTask(dateKey, title)
                setAddingKey(null)
              })
            }
            onCancelAdd={() => setAddingKey(null)}
            onOpenDay={onOpenDay}
            showProjectColor={showProjectColor}
          />
        ))}
      </div>
    </div>
  )
}

interface RangeBarPlacement {
  task: TaskSummary
  startCol: number
  endCol: number
  continuesBefore: boolean
  continuesAfter: boolean
}

// Interval scheduling glotón: ordena por inicio y va llenando carriles —
// dos barras entran en el mismo carril si no se solapan en columnas. No
// hace falta nada más sofisticado: dentro de una sola semana (7 columnas)
// el número de barras superpuestas es chico.
function assignLanes(items: RangeBarPlacement[]): RangeBarPlacement[][] {
  const sorted = [...items].sort((a, b) => a.startCol - b.startCol)
  const lanes: RangeBarPlacement[][] = []
  for (const item of sorted) {
    const lane = lanes.find((l) => (l[l.length - 1]?.endCol ?? -1) < item.startCol)
    if (lane) lane.push(item)
    else lanes.push([item])
  }
  return lanes
}

function MonthWeekRow({
  week,
  anchorDate,
  tasksByDate,
  rangedTasks,
  addingKey,
  onStartAdd,
  onSubmitAdd,
  onCancelAdd,
  onOpenDay,
  showProjectColor,
}: {
  week: WeekDays
  anchorDate: Date
  tasksByDate: Map<string, TaskSummary[]>
  rangedTasks: (TaskSummary & { start_date: string; due_date: string })[]
  addingKey: string | null
  onStartAdd?: (dateKey: string) => void
  onSubmitAdd?: (dateKey: string, title: string) => void
  onCancelAdd: () => void
  onOpenDay: (date: Date) => void
  showProjectColor?: boolean
}) {
  const weekStart = week[0]
  const weekEnd = week[6]

  const placements = rangedTasks
    .map((task): RangeBarPlacement | null => {
      const start = fromDateKey(task.start_date)
      const end = fromDateKey(task.due_date)
      if (end < weekStart || start > weekEnd) return null
      return {
        task,
        startCol: start < weekStart ? 0 : differenceInCalendarDays(start, weekStart),
        endCol: end > weekEnd ? 6 : differenceInCalendarDays(end, weekStart),
        continuesBefore: start < weekStart,
        continuesAfter: end > weekEnd,
      }
    })
    .filter((p): p is RangeBarPlacement => p !== null)
  const lanes = assignLanes(placements)

  return (
    // Un `grid-cols-7` propio por semana (no uno compartido para las 6
    // semanas del mes): así las filas de barra de cada semana auto-fluyen
    // justo debajo de sus 7 celdas, sin position:absolute ni cálculo de
    // offset vertical manual.
    <div className="grid grid-cols-7">
      {week.map((day) => {
        const dateKey = toDateKey(day)
        return (
          <MonthCell
            key={dateKey}
            day={day}
            dateKey={dateKey}
            tasks={tasksByDate.get(dateKey) ?? []}
            outsideMonth={!isSameMonth(day, anchorDate)}
            isAdding={addingKey === dateKey}
            onStartAdd={onStartAdd && (() => onStartAdd(dateKey))}
            onSubmitAdd={onSubmitAdd && ((title) => onSubmitAdd(dateKey, title))}
            onCancelAdd={onCancelAdd}
            onOpenDay={() => onOpenDay(day)}
            showProjectColor={showProjectColor}
          />
        )
      })}
      {lanes.map((lane, laneIndex) =>
        lane.map((item) => (
          <button
            type="button"
            key={item.task.id}
            onClick={() => onOpenDay(week[item.startCol] ?? weekStart)}
            title={item.task.title}
            // +2, no +1: las 7 MonthCell de arriba no tienen `gridRow`
            // explícito, así que el auto-placement de CSS Grid las manda a
            // la fila 1 (una por columna) sin importar el orden del DOM.
            // Con `laneIndex + 1`, el primer carril de barras (laneIndex 0)
            // caía TAMBIÉN en la fila 1 — superpuesto arriba de los números
            // de día en vez de debajo, reventando la grilla entera apenas
            // había una tarea de rango en la semana (el caso común en
            // proyectos con tareas de varios días).
            style={{ gridColumn: `${item.startCol + 1} / span ${item.endCol - item.startCol + 1}`, gridRow: laneIndex + 2 }}
            className={cn(
              'mx-0.5 mb-0.5 flex h-4 min-w-0 items-center truncate bg-accent px-1.5 text-left text-[10px] font-medium text-accent-foreground',
              item.continuesBefore ? 'rounded-l-none' : 'rounded-l-full',
              item.continuesAfter ? 'rounded-r-none' : 'rounded-r-full',
            )}
          >
            {item.task.title}
          </button>
        )),
      )}
    </div>
  )
}

function MonthCell({
  day,
  dateKey,
  tasks,
  outsideMonth,
  isAdding,
  onStartAdd,
  onSubmitAdd,
  onCancelAdd,
  onOpenDay,
  showProjectColor,
}: {
  day: Date
  dateKey: string
  tasks: TaskSummary[]
  outsideMonth: boolean
  isAdding: boolean
  onStartAdd?: () => void
  onSubmitAdd?: (title: string) => void
  onCancelAdd: () => void
  onOpenDay: () => void
  showProjectColor?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })
  const [title, setTitle] = useState('')
  const visible = tasks.slice(0, MAX_VISIBLE)
  const overflow = tasks.length - visible.length

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/cell flex min-h-16 flex-col gap-1 border-b border-r border-border/60 p-1.5 @min-[640px]:min-h-24 [&:nth-child(7n)]:border-r-0',
        outsideMonth && 'bg-surface-alt/40',
        isOver && 'bg-accent-soft/60',
      )}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenDay}
          className={cn(
            'flex size-5 items-center justify-center rounded-full text-xs',
            outsideMonth ? 'text-text-muted' : 'text-text',
            isToday(day) && 'bg-accent font-medium text-accent-foreground',
          )}
        >
          {format(day, 'd')}
        </button>
        {onStartAdd && (
          <button
            type="button"
            onClick={onStartAdd}
            // Visible siempre en touch (sin hover no hay forma de
            // descubrirlo, y acá SÍ es la única vía para crear una tarea
            // con la fecha de este día ya puesta — a diferencia del
            // conector de dependencias del Gantt, no hay atajo
            // alternativo) — auditoría mobile. `after:` agranda el área
            // de toque de los ~14px del ícono a ~30px.
            className="relative opacity-0 transition-opacity after:absolute after:-inset-2 group-hover/cell:opacity-100 [@media(hover:none)]:opacity-100"
            aria-label="Agregar tarea"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-3.5 text-text-muted" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {visible.map((task) => (
          <CalendarTaskChip key={task.id} task={task} showProjectColor={showProjectColor} />
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={onOpenDay}
            className="px-1 text-left text-[11px] text-text-muted hover:text-text hover:underline"
          >
            +{overflow} más
          </button>
        )}
      </div>

      {isAdding && onSubmitAdd && (
        <form
          className="mt-auto"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            onSubmitAdd(title.trim())
            setTitle('')
          }}
        >
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (!title.trim()) onCancelAdd()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancelAdd()
            }}
            placeholder="Título…"
            className="h-6 px-1.5 text-xs"
          />
        </form>
      )}
    </div>
  )
}
