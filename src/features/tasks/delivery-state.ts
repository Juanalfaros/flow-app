import { differenceInCalendarDays, formatDistanceToNowStrict, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatShortDate } from '@/lib/format-date'

export type DeliveryState = 'upcoming' | 'today' | 'overdue' | 'ontime' | 'late'

export interface DeliveryInfo {
  label: string
  /** Texto secundario, más chico/mudo — solo lo llevan 'late' (cuándo
   * vencía) hoy. */
  detail: string | null
  state: DeliveryState
}

// Antes de esto, el detalle de tarea (y TaskCard/TaskRow) usaban
// `formatDueDate` (src/lib/format-date.ts) tal cual: esa función solo
// mira si `due_date` quedó atrás de HOY, nunca si la tarea ya está
// completada — una tarea marcada Hecha con fecha vencida seguía
// mostrando "Venció hace N días" en rojo, como si siguiera atrasada.
// Reportado por el usuario.
//
// Acá se separan los dos ejes que antes se pisaban: "¿sigue abierta y
// atrasada?" (alarma real, roja) vs. "¿se entregó a tiempo o tarde?"
// (dato histórico, ya resuelto — ámbar si tarde, no rojo). Requiere
// `completedAt` (0072_task_completion_tracking.sql: `nodes.completed_at`
// ahora se llena solo al pasar a un estado `status_kind = 'success'`,
// no solo para tareas personales como antes).
export function formatDeliveryState(
  dueDate: string | null,
  isDone: boolean,
  completedAt: string | null,
): DeliveryInfo | null {
  if (!dueDate) return null

  if (isDone) {
    // Tareas completadas ANTES de 0072 no tienen completed_at (sin
    // backfill, ver esa migración) — sin un dato real, mejor no afirmar
    // "a tiempo" ni "tarde" que adivinar mal.
    if (!completedAt) return null
    const due = startOfDay(parseISO(dueDate))
    const completed = startOfDay(parseISO(completedAt))
    const diffDays = differenceInCalendarDays(completed, due)
    if (diffDays <= 0) {
      return { label: 'Entregada a tiempo', detail: formatShortDate(dueDate), state: 'ontime' }
    }
    return {
      label: `Entregada ${diffDays} día${diffDays === 1 ? '' : 's'} tarde`,
      detail: `vencía ${formatShortDate(dueDate)}`,
      state: 'late',
    }
  }

  const due = parseISO(dueDate)
  if (isToday(due)) return { label: 'Vence hoy', detail: null, state: 'today' }
  if (isBefore(due, startOfDay(new Date()))) {
    return {
      label: `Venció hace ${formatDistanceToNowStrict(due, { locale: es, unit: 'day' })}`,
      detail: null,
      state: 'overdue',
    }
  }
  return { label: `Vence ${formatShortDate(dueDate)}`, detail: null, state: 'upcoming' }
}
