import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import { es } from 'date-fns/locale'

export type CalendarRange = 'day' | 'week' | 'month'

// Mutable a propósito, no un parámetro en cada función de este archivo:
// `getWeekDays`/`getMonthGrid`/`getQuickDatePresets`/`formatRangeTitle` se
// llaman entre sí y desde varios componentes de calendario — threadear
// `weekStartsOn` por cada firma habría sido un refactor mucho más grande
// que "respetar la preferencia". `setWeekStartsOn` la actualiza una vez
// (ver useSyncWeekStart, llamado desde AppShell) cuando carga el perfil
// (profiles.week_starts_on, 0058_profile_preferences.sql); mismo criterio
// de "un solo lugar que se sincroniza al cargar" que useThemePreference.
let weekStartsOnPreference: 0 | 1 = 1

export function setWeekStartsOn(day: 0 | 1) {
  weekStartsOnPreference = day
}

function weekOpts() {
  return { weekStartsOn: weekStartsOnPreference, locale: es }
}

// `format(date, 'yyyy-MM-dd')`, no `date.toISOString().slice(0, 10)`: ese
// último convierte a UTC antes de recortar, y el ancla del Calendario
// (`new Date()`, con la hora real) cruza a UTC del día siguiente pasadas
// las 21:00 en Chile (UTC-3) — "siguiente" saltaba dos días (B-07). El
// resto de este archivo ya evita el error a conciencia (`fromDateKey`
// usa `parseISO`, nunca `new Date(string)`); esta era la única puerta que
// había quedado abierta.
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// `parseISO` (no `new Date(string)`): un string sin hora ("2026-07-29") lo
// interpreta en horario LOCAL — `new Date(...)` lo interpreta como UTC
// medianoche, que en husos horarios negativos corre el día mostrado hacia
// atrás. Usado para leer `?date=` de la URL.
export function fromDateKey(key: string): Date {
  return parseISO(key)
}

/** Semanas (lun-dom) que cubren el mes de `anchor`, incluyendo días de
 * meses adyacentes para completar cada semana. */
// El tipo dice dos cosas que el código ya garantizaba pero no expresaba: cada
// semana tiene exactamente 7 días (el intervalo va de inicio a fin de semana,
// así que ninguna tajada queda corta) y siempre hay al menos una semana. Con
// eso, MonthView puede leer `weeks[0]` para la fila de encabezados sin una
// guarda que nunca se cumpliría.
export function getMonthGrid(anchor: Date): [WeekDays, ...WeekDays[]] {
  const start = startOfWeek(startOfMonth(anchor), weekOpts())
  const end = endOfWeek(endOfMonth(anchor), weekOpts())
  const days = eachDayOfInterval({ start, end })
  const weeks: WeekDays[] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7) as WeekDays)
  }
  return weeks as [WeekDays, ...WeekDays[]]
}

/** Los 7 días de la semana que contiene `anchor`, de lunes a domingo. */
export type WeekDays = [Date, Date, Date, Date, Date, Date, Date]

// Devuelve una tupla de 7 y no `Date[]`: una semana siempre tiene siete días,
// y tiparlo así deja que los consumidores usen `days[0]`/`days[6]` sin guardas
// que nunca se cumplirían. El `as` es la única afirmación del archivo y está
// respaldada por el intervalo de startOfWeek..endOfWeek, que por definición
// abarca exactamente una semana.
export function getWeekDays(anchor: Date): WeekDays {
  return eachDayOfInterval({
    start: startOfWeek(anchor, weekOpts()),
    end: endOfWeek(anchor, weekOpts()),
  }) as WeekDays
}

export function shiftAnchorDate(anchor: Date, range: CalendarRange, dir: 1 | -1): Date {
  if (range === 'month') return dir === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1)
  if (range === 'week') return dir === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1)
  return dir === 1 ? addDays(anchor, 1) : subDays(anchor, 1)
}

export interface QuickDatePreset {
  label: string
  date: Date
}

/** Atajos de TaskDateRangePicker (Hoy/Mañana/fin de semana/etc), todos
 * relativos a `today` y construidos con los mismos date-fns + weekOpts()
 * que ya usa el resto de este archivo — así "fin de semana" coincide con
 * el mismo lun-dom que usan Month/WeekView. */
export function getQuickDatePresets(today: Date): QuickDatePreset[] {
  const thisSaturday = subDays(endOfWeek(today, weekOpts()), 1)
  const nextWeekMonday = addWeeks(startOfWeek(today, weekOpts()), 1)
  const nextSaturday = addWeeks(thisSaturday, 1)

  return [
    { label: 'Hoy', date: today },
    { label: 'Mañana', date: addDays(today, 1) },
    { label: 'Este fin de semana', date: thisSaturday },
    { label: 'Semana siguiente', date: nextWeekMonday },
    { label: 'Fin de semana siguiente', date: nextSaturday },
    { label: '2 semanas', date: addWeeks(today, 2) },
    { label: '4 semanas', date: addWeeks(today, 4) },
  ]
}

export function formatRangeTitle(anchor: Date, range: CalendarRange): string {
  if (range === 'month') {
    const label = format(anchor, 'MMMM yyyy', { locale: es })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  if (range === 'week') {
    const days = getWeekDays(anchor)
    const first = days[0]
    const last = days[6]
    return `${format(first, 'd')} – ${format(last, 'd MMM yyyy', { locale: es })}`
  }
  const label = format(anchor, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
