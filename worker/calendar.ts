import { createClient } from '@supabase/supabase-js'
import type { Env } from './index'

interface FeedEvent {
  kind: string
  uid: string
  title: string
  starts_on: string
  ends_on: string | null
  due_time: string | null
  changed_at: string
}

/**
 * Escapa un valor de texto para iCalendar (RFC 5545 §3.3.11).
 *
 * La barra invertida va PRIMERA: si se escapara después de las comas, se
 * duplicarían las barras que la propia función acaba de insertar. Los saltos
 * de línea se codifican como `\n` literal, no como salto real, porque un salto
 * real terminaría la propiedad.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
    // Caracteres de control (auditoría de seguridad 2026-09-16, S9): un
    // título con uno de estos produce un .ics que algunos clientes
    // rechazan directo. No es un vector de inyección de propiedades —
    // eso ya está cubierto arriba, saltos de línea incluidos — es
    // robustez de parseo.
    // eslint-disable-next-line no-control-regex -- intencional, es justo lo que hay que filtrar.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

/**
 * Plegado de líneas (RFC 5545 §3.1): ninguna línea puede pasar de 75 octetos.
 *
 * Se cuenta en BYTES y no en caracteres: los títulos en español llevan tildes,
 * que en UTF-8 ocupan dos. Cortar por longitud de string dejaría líneas
 * demasiado largas, y peor, podría partir un carácter multibyte a la mitad y
 * producir un archivo que algunos clientes rechazan.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line

  const out: string[] = []
  let current = ''
  let currentBytes = 0
  for (const char of line) {
    const charBytes = encoder.encode(char).length
    // 74 y no 75: la continuación empieza con un espacio que también cuenta.
    if (currentBytes + charBytes > 74) {
      out.push(current)
      current = ''
      currentBytes = 0
    }
    current += char
    currentBytes += charBytes
  }
  if (current) out.push(current)
  return out.join('\r\n ')
}

/** `YYYY-MM-DD` → `YYYYMMDD`, el formato DATE de iCalendar. */
function toIcsDate(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

/** Un día después: DTEND de un evento de día completo es EXCLUSIVO. */
function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return toIcsDate(date.toISOString().slice(0, 10))
}

function toIcsTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function renderCalendar(events: FeedEvent[], origin: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flow//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Flow',
    // Sugerencia de cada cuánto refrescar. Google la toma como pista, no como
    // orden: en la práctica refresca los feeds externos con su propio ritmo,
    // que puede ser de varias horas.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]

  for (const event of events) {
    if (!event.starts_on) continue
    const end = event.ends_on ?? event.starts_on

    lines.push('BEGIN:VEVENT')
    // El UID incluye el origen para ser único globalmente, y es estable entre
    // refrescos: así el calendario actualiza el evento existente en vez de
    // duplicarlo cada vez que lee el feed.
    lines.push(`UID:${event.kind}-${event.uid}@${new URL(origin).hostname}`)
    lines.push(`DTSTAMP:${toIcsTimestamp(event.changed_at)}`)
    // Eventos de día completo: las tareas tienen fecha, y `due_time` es solo
    // display en la app (0021), así que no se convierte a hora con zona —
    // hacerlo obligaría a elegir un huso y correría el evento de día para
    // quien esté en otro.
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.starts_on)}`)
    lines.push(`DTEND;VALUE=DATE:${nextDay(end)}`)
    lines.push(`SUMMARY:${escapeText(event.title)}`)
    if (event.kind === 'time_off') lines.push('TRANSP:TRANSPARENT')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  // `foldLine` en TODAS las líneas, no solo SUMMARY (S9): UID incluye el
  // hostname del origen y puede pasar los 75 octetos que exige RFC 5545
  // §3.1 sin plegarse — algunos clientes rechazan el archivo completo si
  // una sola línea se pasa. `foldLine` ya es un no-op para líneas cortas,
  // así que aplicarla a todas no cambia nada para el resto.
  // CRLF obligatorio por RFC 5545 §3.1.
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/**
 * Sirve el feed iCal de una persona.
 *
 * El token de la URL es la única credencial: no hay sesión ni JWT. Por eso la
 * RPC que lo resuelve (`calendar_feed_events`) está concedida solo a
 * `service_role` y aplica ella misma el filtro de acceso por espacio — el
 * Worker no decide autorización, igual que en `/api/invite`.
 */
export async function handleCalendarFeed(request: Request, env: Env, token: string): Promise<Response> {
  // Los tokens son 64 caracteres hex (0033). Validar la forma antes de
  // consultar evita convertir la base en un oráculo de fuerza bruta.
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return new Response('Not found', { status: 404 })
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await admin.rpc('calendar_feed_events', { p_token: token })

  if (error) {
    console.error('calendar_feed_events failed:', error.message)
    return new Response('Error', { status: 502 })
  }

  const origin = new URL(request.url).origin
  const body = renderCalendar((data ?? []) as FeedEvent[], origin)

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="flow.ics"',
      // `private` y `no-store`: el contenido es personal y la URL lleva el
      // token, así que no debe quedar en ninguna caché intermedia.
      'Cache-Control': 'private, no-store',
    },
  })
}
