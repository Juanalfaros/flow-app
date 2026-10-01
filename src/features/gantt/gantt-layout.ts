import { addDays, differenceInCalendarDays } from 'date-fns'
import { fromDateKey } from '@/features/calendar/date-utils'
import type { TaskSummary } from '@/features/tasks/queries'

export type GanttZoom = 'day' | 'week' | 'month'

// Los tres niveles siguen dibujando una columna por día (ver comentario en
// GanttHeader.tsx) — lo único que cambia es el ancho de cada una. "Semana"
// y "Mes" no rehacen el modelo de fechas, solo lo comprimen: no hace falta
// agrupar columnas para ganar la vista de panorama que pide un proyecto
// largo.
export const ZOOM_PX_PER_DAY: Record<GanttZoom, number> = {
  day: 32,
  week: 12,
  month: 5,
}
export const ZOOM_LABEL: Record<GanttZoom, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
}

export const ROW_HEIGHT = 36
export const LEFT_COLUMN_WIDTH = 240
export const HEADER_HEIGHT = 32
const RANGE_PADDING_DAYS = 2

export interface TaskRange {
  task: TaskSummary
  start: Date
  end: Date
}

// Tareas sin ninguna fecha quedan afuera del Gantt (mismo criterio que
// Calendario). Con una sola fecha, la barra colapsa a un día. `end` nunca
// es anterior a `start` gracias al check `nodes_start_before_due` de la
// migración.
export function getTaskRange(task: TaskSummary): TaskRange | null {
  if (!task.start_date && !task.due_date) return null
  const start = fromDateKey(task.start_date ?? task.due_date!)
  const end = fromDateKey(task.due_date ?? task.start_date!)
  return { task, start, end }
}

export function getScheduledTasks(tasks: TaskSummary[]): TaskRange[] {
  return tasks
    .map(getTaskRange)
    .filter((r): r is TaskRange => r !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

// Antes se perdían en silencio: `getScheduledTasks` las descartaba y no
// quedaba ni contador ni indicación visual de que existían. La bandeja de
// "sin programar" (GanttChart.tsx) las rescata.
export function getUnscheduledTasks(tasks: TaskSummary[]): TaskSummary[] {
  return tasks.filter((t) => getTaskRange(t) === null)
}

export function computeDateRange(ranges: TaskRange[]): { start: Date; end: Date } {
  if (ranges.length === 0) {
    const today = new Date()
    return { start: addDays(today, -RANGE_PADDING_DAYS), end: addDays(today, 14) }
  }
  const starts = ranges.map((r) => r.start.getTime())
  const ends = ranges.map((r) => r.end.getTime())
  return {
    start: addDays(new Date(Math.min(...starts)), -RANGE_PADDING_DAYS),
    end: addDays(new Date(Math.max(...ends)), RANGE_PADDING_DAYS),
  }
}

export function dateToX(date: Date, rangeStart: Date, pxPerDay: number): number {
  return differenceInCalendarDays(date, rangeStart) * pxPerDay
}

export function xToDayOffset(x: number, pxPerDay: number): number {
  return Math.round(x / pxPerDay)
}

export function chartWidth(range: { start: Date; end: Date }, pxPerDay: number): number {
  return (differenceInCalendarDays(range.end, range.start) + 1) * pxPerDay
}
