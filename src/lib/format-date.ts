import { format, formatDistanceToNowStrict, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

export type DueDateState = 'overdue' | 'today' | 'future'

export interface FormattedDueDate {
  label: string
  state: DueDateState
}

// Única fuente de verdad para mostrar `due_date`/`start_date` (`date` de
// Postgres, `YYYY-MM-DD`) de forma humanizada. Antes de esto, TaskCard,
// TaskRow, MyTaskListItem y el calendario mostraban el string ISO crudo
// cada uno por su cuenta — mismo bug repetido en 4+ lugares.
export function formatDueDate(dateStr: string): FormattedDueDate {
  const date = parseISO(dateStr)
  if (isToday(date)) return { label: 'Hoy', state: 'today' }
  if (isBefore(date, startOfDay(new Date()))) {
    return { label: `Venció hace ${formatDistanceToNowStrict(date, { locale: es, unit: 'day' })}`, state: 'overdue' }
  }
  return { label: format(date, 'd MMM', { locale: es }), state: 'future' }
}

// Timestamp completo (`created_at`, `timestamptz`) → relativo humanizado
// ("hace 3 horas"). Reemplaza `new Date(x).toLocaleString()`, que muestra
// fecha/hora larga sin locale `es` (Bandeja, Actividad reciente).
export function formatRelativeTime(iso: string): string {
  return formatDistanceToNowStrict(parseISO(iso), { locale: es, addSuffix: true })
}

// Fecha corta sin relatividad ("28 jul") — para metadata que se consulta
// pero no urge (creada el, próximo hito), a diferencia de formatDueDate
// que sí distingue vencida/hoy/futura.
export function formatShortDate(iso: string): string {
  return format(parseISO(iso), 'd MMM', { locale: es })
}

// Fecha absoluta numérica ("07/09/2026"), según `profiles.date_format`
// (0058_profile_preferences.sql: 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd')
// — esos tres valores SON patrones válidos de date-fns, no hace falta
// mapearlos a otra cosa. Para "miembro desde"/fechas de metadata donde
// tiene sentido un formato numérico completo, a diferencia de
// formatShortDate (mes abreviado, sin año, pensado para densidad en filas
// de tarea — no se toca acá para no arriesgar esos layouts ya ajustados).
export function formatNumericDate(iso: string, dateFormat: string): string {
  return format(parseISO(iso), dateFormat, { locale: es })
}
