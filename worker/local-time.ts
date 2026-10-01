// Hora y día LOCAL de una persona a partir de su `timezone` (columna de
// `profiles`, IANA). Compartido por digest-dispatch.ts (día/hora del
// resumen) y push-dispatch.ts (horario de silencio) — los dos necesitan lo
// mismo: convertir un instante UTC a "qué día y qué hora es para esta
// persona ahora", sin arrastrar una librería de zonas horarias al Worker
// cuando `Intl.DateTimeFormat` (nativo del runtime de Cloudflare) ya lo
// resuelve.

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Día (0=domingo, mismo criterio que `week_starts_on`) y hora locales de
 *  `date` en la zona horaria dada. */
export function localWeekdayAndHour(date: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(
    date,
  )
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0'
  // Algunos motores devuelven "24" para la medianoche con hour12:false.
  const hour = Number(hourStr) % 24
  return { weekday: WEEKDAY_INDEX[weekdayStr] ?? 0, hour }
}

/**
 * Instante UTC del inicio y fin del día LOCAL de `date` en `timeZone`.
 *
 * Usado por la agenda de Inicio (worker/google.ts, `?range=today`) para
 * pedirle a Google Calendar solo los eventos de HOY en la zona horaria de
 * la persona, no del servidor. Truco estándar para hallar el offset de una
 * zona en un instante dado sin sumar una librería: se formatea `date` en
 * `timeZone` y se leen esos mismos números de reloj COMO SI fueran UTC
 * (`Date.UTC`) — la diferencia contra el instante real es el offset. No
 * corrige el caso borde de un cambio de horario de verano a mitad del día
 * (quedaría con un límite ±1h corrido); mismo nivel de precisión que
 * `localWeekdayAndHour` de arriba, suficiente para agrupar eventos por día.
 */
export function localDayBoundsUtc(date: Date, timeZone: string): { startUtc: Date; endUtc: Date } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value
      return acc
    }, {})

  const year = Number(parts.year)
  const month = Number(parts.month) - 1
  const day = Number(parts.day)
  const hour = Number(parts.hour) % 24

  const asIfUtc = Date.UTC(year, month, day, hour, Number(parts.minute), Number(parts.second))
  const offsetMs = asIfUtc - date.getTime()

  const startUtc = new Date(Date.UTC(year, month, day, 0, 0, 0) - offsetMs)
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)
  return { startUtc, endUtc }
}

export interface QuietHoursProfile {
  timezone: string | null
  quiet_hours_enabled: boolean
  quiet_hours_start: number
  quiet_hours_end: number
  quiet_weekends: boolean
}

/**
 * ¿"Ahora" cae dentro del horario de silencio de esta persona?
 *
 * Dos condiciones independientes, cualquiera alcanza (0092_notification_
 * preferences.sql): la ventana horaria diaria (`quiet_hours_start/end`,
 * cruza medianoche si `start > end` — 20→8 es el default) y "todo el
 * fin de semana" (`quiet_weekends`). Nunca toca la Bandeja, ni bloquea el
 * correo — quien llama decide qué canal condicionar con esto.
 */
export function isQuietNow(date: Date, profile: QuietHoursProfile): boolean {
  const { weekday, hour } = localWeekdayAndHour(date, profile.timezone ?? 'America/Santiago')

  if (profile.quiet_weekends && (weekday === 0 || weekday === 6)) return true
  if (!profile.quiet_hours_enabled) return false

  const { quiet_hours_start: start, quiet_hours_end: end } = profile
  if (start === end) return false
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}
