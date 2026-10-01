import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { InboxIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { CalendarTaskChip } from '@/features/calendar/components/CalendarTaskChip'
import { toDateKey } from '@/features/calendar/date-utils'
import type { TaskSummary } from '@/features/tasks/queries'

interface DayViewProps {
  anchorDate: Date
  tasksByDate: Map<string, TaskSummary[]>
  /** Omitido (S-06, calendario global) — ver MonthView.tsx. */
  onCreateTask?: (dateKey: string, title: string) => void
  showProjectColor?: boolean
}

// Sin `useDroppable`: es una sola columna, no hay otro contenedor dentro
// de la vista para soltar una tarea (a diferencia de Mes/Semana).
export function DayView({ anchorDate, tasksByDate, onCreateTask, showProjectColor }: DayViewProps) {
  const dateKey = toDateKey(anchorDate)
  const tasks = tasksByDate.get(dateKey) ?? []
  const [title, setTitle] = useState('')

  return (
    <div className="mx-auto flex max-w-md flex-col gap-2 rounded-card border border-border/60 bg-surface p-3 shadow-card">
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-10 text-center">
          <HugeiconsIcon icon={InboxIcon} className="size-5 text-text-muted/60" />
          <p className="text-sm text-text-muted">Sin tareas para este día.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <CalendarTaskChip key={task.id} task={task} showProjectColor={showProjectColor} />
          ))}
        </div>
      )}

      {onCreateTask && (
        <form
          className="flex items-center gap-1.5 rounded-md px-2 has-[:focus-visible]:bg-bg"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            onCreateTask(dateKey, title.trim())
            setTitle('')
          }}
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-3.5 shrink-0 text-text-muted" />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Agregar tarea"
            className="h-8 border-transparent bg-transparent px-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
        </form>
      )}
    </div>
  )
}
