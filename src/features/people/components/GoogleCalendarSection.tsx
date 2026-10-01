import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, Mail01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingRow } from '@/features/profile/components/settings-ui'
import { formatRelativeTime } from '@/lib/format-date'
import {
  useConnectGoogleMutation,
  useDisconnectGoogleMutation,
  useGoogleCalendar,
  useGoogleConnection,
} from '@/features/people/google-calendar'

/**
 * Conectar la cuenta de Google para ver los eventos propios dentro de la app.
 *
 * Es lo opuesto al feed iCal (`CalendarFeedSection`), que exporta tareas hacia
 * Google sin pedir permisos. Acá sí hay OAuth, así que el texto dice qué se
 * concede y qué no antes de mandar a nadie a la pantalla de consentimiento:
 * pedir permisos sin explicarlos es cómo se entrena a la gente a aceptar
 * cualquier cosa.
 */
export function GoogleCalendarSection({ workspaceId }: { workspaceId: string }) {
  const { data: connection, isPending: connectionPending } = useGoogleConnection()
  const { data: calendar, isPending: calendarPending, isError: calendarError } = useGoogleCalendar()
  const connect = useConnectGoogleMutation(workspaceId)
  const disconnect = useDisconnectGoogleMutation()

  // Se espera a las DOS consultas, no solo a la de Postgres: si se resuelve
  // primero la conexión, aparece un instante el botón "Conectar" antes de
  // saber si el servidor siquiera tiene la integración montada.
  if (connectionPending || calendarPending) return <Skeleton className="h-16" />

  // Dos caminos distintos llegan acá y conviene no confundirlos:
  //
  //   * `configured: false` — el Worker está vivo pero le faltan los secrets
  //     de Google. Es el estado normal mientras la app corra en el dominio de
  //     pruebas: el cliente OAuth se crea recién con el dominio definitivo,
  //     porque el URI de redirección tiene que coincidir exactamente con el
  //     que registre Google Cloud.
  //   * error de red — en `pnpm dev` solo corre Vite, que no conoce
  //     /api/google/* y devuelve 404.
  //
  // En ambos el botón "Conectar" fallaría, así que no se ofrece. Cuando los
  // secrets estén cargados esto se prende solo, sin tocar código.
  if (calendarError || calendar?.configured === false) {
    return (
      <p className="text-xs text-text-muted">
        {calendarError
          ? 'No pudimos comprobar la conexión con Google. La integración corre en el Worker: en desarrollo local hace falta `wrangler dev`.'
          : 'Disponible cuando la app esté en su dominio definitivo.'}
      </p>
    )
  }

  if (!connection) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-text-secondary">
          Conecta tu cuenta para ver tus próximos eventos de Google junto a tus tareas. Pedimos acceso{' '}
          <strong>solo de lectura</strong>: Flow no crea, edita ni borra nada en tu calendario.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          disabled={connect.isPending}
          onClick={() => connect.mutate()}
        >
          {connect.isPending ? 'Abriendo Google…' : 'Conectar con Google'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingRow
        icon={Mail01Icon}
        title={<span className="truncate">{connection.google_email}</span>}
        subtitle={
          connection.last_synced_at ? `Sincronizado ${formatRelativeTime(connection.last_synced_at)}` : 'Sin sincronizar todavía'
        }
        wrap
        action={
          <Button size="sm" variant="ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
            {disconnect.isPending ? 'Desconectando…' : 'Desconectar'}
          </Button>
        }
      />

      {/* Los próximos eventos también acá, no solo en la ficha de persona:
          es la prueba de que la conexión funciona, justo donde se acaba de
          conceder el permiso. */}
      <GoogleUpcomingEvents />

      {/* El permiso se puede revocar desde la cuenta de Google, fuera de la
          app. Cuando eso pasa el refresh token deja de servir y la única
          salida es volver a conectar — decirlo evita que parezca una falla. */}
      {calendar?.revoked && (
        <div role="alert" className="flex items-start gap-1.5 text-xs text-warning">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-3.5 shrink-0" />
          <span>Google revocó el acceso. Vuelve a conectar para seguir viendo tus eventos.</span>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Al desconectar también revocamos el permiso en tu cuenta de Google, no solo acá.
      </p>
    </div>
  )
}

/**
 * Los próximos eventos, para la pestaña Calendario de la ficha propia.
 *
 * Separado de la sección de conexión porque son dos lugares distintos: esto va
 * donde alguien mira su agenda, y aquello donde administra permisos.
 */
export function GoogleUpcomingEvents() {
  const { data, isPending, isError } = useGoogleCalendar()

  if (isPending) return <Skeleton className="h-24" />
  if (isError || !data?.connected) return null
  if (data.events.length === 0) {
    return <p className="text-xs text-text-muted">Sin eventos próximos en Google Calendar.</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {data.events.map((event) => (
        <li key={event.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-surface-alt">
          <span className="min-w-0 flex-1 truncate text-sm">
            {event.link ? (
              <a href={event.link} target="_blank" rel="noreferrer" className="hover:underline">
                {event.title}
              </a>
            ) : (
              event.title
            )}
          </span>
          <span className="shrink-0 text-xs text-text-muted">{formatEventStart(event.startsAt, event.allDay)}</span>
        </li>
      ))}
    </ul>
  )
}

function formatEventStart(startsAt: string | null, allDay: boolean): string {
  if (!startsAt) return ''
  // Los eventos de día completo llegan como 'YYYY-MM-DD'. Pasarlos por `new
  // Date()` los interpreta como UTC medianoche y en Chile (UTC-3/-4) muestran
  // el día anterior — el mismo cuidado que ya toma el feed iCal.
  if (allDay) {
    const [year, month, day] = startsAt.split('-').map(Number)
    if (!year || !month || !day) return ''
    return new Date(year, month - 1, day).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  }
  return new Date(startsAt).toLocaleString('es-CL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
