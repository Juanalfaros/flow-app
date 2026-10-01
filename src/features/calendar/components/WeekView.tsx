import { useEffect, useRef, useState } from 'react'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { useDroppable } from '@dnd-kit/core'
import { HugeiconsIcon } from '@hugeicons/react'
import { InboxIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { CalendarTaskChip } from '@/features/calendar/components/CalendarTaskChip'
import { getWeekDays, toDateKey } from '@/features/calendar/date-utils'
import type { TaskSummary } from '@/features/tasks/queries'
import { cn } from '@/lib/utils'

interface WeekViewProps {
  anchorDate: Date
  tasksByDate: Map<string, TaskSummary[]>
  /** Omitido (S-06, calendario global) — ver MonthView.tsx. */
  onCreateTask?: (dateKey: string, title: string) => void
  showProjectColor?: boolean
}

export function WeekView({ anchorDate, tasksByDate, onCreateTask, showProjectColor }: WeekViewProps) {
  const days = getWeekDays(anchorDate)
  const weekKey = days[0] ? toDateKey(days[0]) : ''
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  // En mobile las 7 columnas son un carrusel con snap-scroll (una por vez,
  // con "peek" de la siguiente) en vez de una grilla aplastada. Este efecto
  // resetea la posición al cambiar de semana y usa IntersectionObserver
  // para saber qué día está a la vista y así resaltar su punto abajo.
  // En desktop (@min-[640px]:) vuelve a ser la grilla de 7 columnas normal,
  // donde esto no tiene efecto visible (los puntos se ocultan).
  useEffect(() => {
    setActiveIndex(0)
    const root = scrollRef.current
    root?.scrollTo({ left: 0 })
    if (!root) return

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!mostVisible) return
        const index = itemRefs.current.findIndex((el) => el === mostVisible.target)
        if (index !== -1) setActiveIndex(index)
      },
      { root, threshold: [0.5, 0.75, 1] },
    )
    itemRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [weekKey])

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 @min-[640px]:grid @min-[640px]:grid-cols-7 @min-[640px]:snap-none @min-[640px]:overflow-visible"
      >
        {days.map((day, index) => {
          const dateKey = toDateKey(day)
          return (
            <WeekColumn
              key={dateKey}
              registerRef={(el) => {
                itemRefs.current[index] = el
              }}
              day={day}
              dateKey={dateKey}
              tasks={tasksByDate.get(dateKey) ?? []}
              onCreateTask={onCreateTask && ((title) => onCreateTask(dateKey, title))}
              showProjectColor={showProjectColor}
            />
          )
        })}
      </div>

      {/* Indicador de posición del carrusel — solo mobile, oculto en la grilla desktop. */}
      <div className="flex justify-center gap-1.5 @min-[640px]:hidden">
        {days.map((day, index) => (
          <button
            key={toDateKey(day)}
            type="button"
            aria-label={`Ir a ${format(day, 'EEEE d', { locale: es })}`}
            aria-current={index === activeIndex}
            onClick={() => itemRefs.current[index]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })}
            className={cn('size-1.5 rounded-full transition-colors', index === activeIndex ? 'bg-accent' : 'bg-border')}
          />
        ))}
      </div>
    </div>
  )
}

function WeekColumn({
  day,
  dateKey,
  tasks,
  onCreateTask,
  registerRef,
  showProjectColor,
}: {
  day: Date
  dateKey: string
  tasks: TaskSummary[]
  onCreateTask?: (title: string) => void
  registerRef: (el: HTMLDivElement | null) => void
  showProjectColor?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })
  const [title, setTitle] = useState('')

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        registerRef(node)
      }}
      className={cn(
        'flex min-h-[45vh] shrink-0 basis-[85%] snap-start flex-col gap-2 rounded-card border border-border/60 bg-surface p-2 shadow-card @min-[640px]:min-h-[60vh] @min-[640px]:shrink @min-[640px]:basis-auto @min-[640px]:snap-align-none',
        isOver && 'bg-accent-soft/60',
      )}
    >
      <div className="flex items-center gap-1.5 px-0.5">
        <span
          className={cn(
            'flex size-5 items-center justify-center rounded-full text-xs',
            isToday(day) && 'bg-accent font-medium text-accent-foreground',
          )}
        >
          {format(day, 'd')}
        </span>
        <span className="text-xs font-medium text-text-muted capitalize">{format(day, 'EEE', { locale: es })}</span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        {tasks.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 py-4 text-center">
            <HugeiconsIcon icon={InboxIcon} className="size-4 text-text-muted/50" />
          </div>
        )}
        {tasks.map((task) => (
          <CalendarTaskChip key={task.id} task={task} showProjectColor={showProjectColor} />
        ))}
      </div>

      {onCreateTask && (
        <form
          className="flex items-center gap-1 rounded-md px-1 has-[:focus-visible]:bg-bg"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            onCreateTask(title.trim())
            setTitle('')
          }}
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-3 shrink-0 text-text-muted" />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Agregar tarea"
            className="h-6 border-transparent bg-transparent px-0 text-xs shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
        </form>
      )}
    </div>
  )
}
