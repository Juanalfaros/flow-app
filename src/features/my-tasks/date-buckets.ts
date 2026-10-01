import { isPast, isToday, parseISO } from 'date-fns'

export interface DueDateBuckets<T> {
  hoy: T[]
  conAtraso: T[]
  siguiente: T[]
  sinFecha: T[]
}

// `parseISO` (no `new Date(string)`): `due_date` es "YYYY-MM-DD" sin
// hora, que `new Date()` interpreta como UTC medianoche y corre el día
// hacia atrás en husos horarios negativos — mismo fix que ya aplica
// src/features/calendar/date-utils.ts. El orden de los checks importa:
// `isToday` se evalúa primero porque la medianoche de "hoy" ya pasó, así
// que `isPast` solo sirve para separar "atrasada" de "futura" una vez
// descartado el caso "hoy".
export function groupByDueBucket<T extends { due_date: string | null }>(tasks: T[]): DueDateBuckets<T> {
  const buckets: DueDateBuckets<T> = { hoy: [], conAtraso: [], siguiente: [], sinFecha: [] }
  for (const task of tasks) {
    if (!task.due_date) {
      buckets.sinFecha.push(task)
      continue
    }
    const date = parseISO(task.due_date)
    if (isToday(date)) buckets.hoy.push(task)
    else if (isPast(date)) buckets.conAtraso.push(task)
    else buckets.siguiente.push(task)
  }
  return buckets
}
