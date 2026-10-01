import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { authorizedFetch, readJsonBody } from '@/lib/api-fetch'

/**
 * Google Calendar en sentido entrante: ver los eventos propios dentro de la app.
 *
 * Es la contraparte de `calendar-feed.ts`, que va en el sentido opuesto
 * (exportar tareas y ausencias hacia Google por URL). Las dos coexisten y
 * resuelven cosas distintas: el feed no necesita cuenta de Google ni permisos,
 * esto sí.
 *
 * Todo pasa por el Worker: el `client_secret` de Google no puede vivir en el
 * navegador, y el refresh token se cifra antes de tocar la base — ver
 * worker/google.ts y 0040_google_credentials.sql.
 */

export interface GoogleEvent {
  id: string
  title: string
  startsAt: string | null
  endsAt: string | null
  allDay: boolean
  link: string | null
}

export interface GoogleCalendarState {
  connected: boolean
  /** Google revocó el permiso desde la cuenta; hay que reconectar. */
  revoked?: boolean
  /** Faltan los secrets en el Worker: la integración ni siquiera está montada. */
  configured?: boolean
  events: GoogleEvent[]
}

// `range: 'today'` es la agenda de Inicio (HomeDashboard → AgendaSection):
// solo los eventos de HOY en la zona horaria de la persona, no "los
// próximos 10" que usan GoogleCalendarSection/GoogleUpcomingEvents. Mismo
// endpoint, un query param — ver `?range=today` en worker/google.ts.
export const googleCalendarQueryOptions = (range?: 'today') =>
  queryOptions({
    queryKey: ['google-calendar', range ?? 'upcoming'] as const,
    queryFn: async (): Promise<GoogleCalendarState> => {
      const res = await authorizedFetch(range ? `/api/google/events?range=${range}` : '/api/google/events')
      const body = await readJsonBody<GoogleCalendarState & { error?: string }>(res, '/api/google/events')
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      return { connected: body.connected ?? false, revoked: body.revoked, configured: body.configured, events: body.events ?? [] }
    },
    // Los eventos sí cambian por fuera de la app, a diferencia del token del
    // feed. 5 minutos evita pedirle a Google un access token nuevo en cada
    // montaje sin que la agenda quede visiblemente vieja.
    staleTime: 5 * 60 * 1000,
  })

export function useGoogleCalendar(range?: 'today') {
  return useQuery(googleCalendarQueryOptions(range))
}

/**
 * Pide al Worker la URL de consentimiento y navega hacia ella.
 *
 * No se arma en el cliente porque el `state` va firmado con un secret del
 * Worker: es lo que ata el callback a quien inició el flujo. Sin esa firma,
 * cualquiera podría completar el intercambio con un `code` ajeno.
 */
export function useConnectGoogleMutation(workspaceId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await authorizedFetch('/api/google/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      const body = await readJsonBody<{ url?: string; error?: string }>(res, '/api/google/start')
      if (!res.ok || !body.url) throw new Error(body.error ?? 'No se pudo iniciar la conexión con Google.')
      return body.url
    },
    onSuccess: (url) => {
      // Navegación completa, no una ventana nueva: Google bloquea su pantalla
      // de consentimiento dentro de iframes, y un popup se lo come cualquier
      // bloqueador. Se vuelve a /profile?google=… al terminar.
      window.location.href = url
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo conectar con Google.'),
  })
}

export function useDisconnectGoogleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await authorizedFetch('/api/google/disconnect', { method: 'POST' })
      const body = await readJsonBody<{ error?: string }>(res, '/api/google/disconnect')
      if (!res.ok) throw new Error(body.error ?? 'No se pudo desconectar.')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['google-calendar'] })
      void queryClient.invalidateQueries({ queryKey: ['google-connection'] })
      toast.success('Google Calendar desconectado.')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo desconectar.'),
  })
}

/**
 * La conexión en sí, leída directo de Postgres.
 *
 * Separada de los eventos a propósito: mostrar "conectado como X" no debería
 * costar un round-trip a Google. Esta consulta solo pide las columnas no
 * secretas — el ciphertext nunca se selecciona, aunque la RLS lo permitiría
 * para la propia fila (ver la nota en 0040_google_credentials.sql).
 */
export const googleConnectionQueryOptions = () =>
  queryOptions({
    queryKey: ['google-connection'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_credentials')
        .select('google_email, connected_at, last_synced_at')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

export function useGoogleConnection() {
  return useQuery(googleConnectionQueryOptions())
}

/**
 * Traduce el `?google=` con el que vuelve el callback.
 *
 * El callback es una navegación del navegador, no un fetch: no hay dónde
 * mostrar un JSON de error, así que el resultado viaja en el query string.
 */
export function describeGoogleCallback(status: string | null): { ok: boolean; message: string } | null {
  switch (status) {
    case null:
      return null
    case 'conectado':
      return { ok: true, message: 'Google Calendar conectado.' }
    case 'cancelado':
      return { ok: false, message: 'Cancelaste la conexión con Google.' }
    case 'expirado':
      return { ok: false, message: 'La solicitud venció. Vuelve a intentarlo.' }
    case 'sin-refresh':
      return {
        ok: false,
        message: 'Google no entregó un permiso duradero. Revoca el acceso de Flow en tu cuenta de Google y vuelve a conectar.',
      }
    case 'no-config':
      return { ok: false, message: 'La integración con Google no está configurada en el servidor.' }
    default:
      return { ok: false, message: 'No se pudo conectar con Google.' }
  }
}
