import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar03Icon, Copy01Icon, Link01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingRow } from '@/features/profile/components/settings-ui'
import { useSession } from '@/features/auth/queries'
import { formatRelativeTime } from '@/lib/format-date'
import {
  calendarFeedUrl,
  useCalendarFeed,
  useCalendarFeedAccess,
  useRegenerateCalendarFeedMutation,
} from '@/features/people/calendar-feed'

/**
 * Suscripción a Google Calendar por URL.
 *
 * Vive en dos lugares a propósito: la pestaña Calendario de la ficha propia
 * (donde está el resto de lo que se sincroniza) y `/profile` → Integraciones,
 * que es donde la gente va a buscar "conectar mi calendario" — esa sección ya
 * anunciaba Google Calendar como pendiente.
 *
 * Es un feed de solo lectura: las tareas y ausencias aparecen en el calendario
 * pero no se editan desde ahí. El texto lo dice para que nadie espere lo
 * contrario, y advierte que la URL es la credencial: sin eso, compartirla
 * parece inofensivo.
 */
export function CalendarFeedSection({ workspaceId, compact }: { workspaceId: string; compact?: boolean }) {
  const { data: session } = useSession()
  const { data: token, isPending, isError, error, fetchStatus, refetch } = useCalendarFeed(workspaceId)
  const { data: lastAccessedAt } = useCalendarFeedAccess(session?.user.id)
  const regenerate = useRegenerateCalendarFeedMutation(workspaceId, session?.user.id)
  const [revealed, setRevealed] = useState(false)

  // `isPending || !token` era un skeleton eterno para TRES estados distintos:
  // cargando, fallando, y consulta deshabilitada (React Query reporta
  // `isPending: true` indefinidamente cuando `enabled` es false, que acá pasa
  // mientras `workspaceId` esté vacío). Un error que se ve igual que una carga
  // es lo peor de los dos mundos: nadie sabe si esperar o reportar.
  if (isPending && fetchStatus === 'fetching') {
    return <Skeleton className="h-20" />
  }

  if (isError || !token) {
    const detail = error instanceof Error ? error.message : null
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-xs text-text-secondary">
          {workspaceId
            ? 'No pudimos generar tu enlace de calendario.'
            : 'Todavía estamos cargando tu espacio de trabajo.'}
        </p>
        {detail && <p className="font-mono text-[10px] break-all text-text-muted">{detail}</p>}
        {workspaceId && (
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        )}
      </div>
    )
  }

  const url = calendarFeedUrl(token)

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon icon={Calendar03Icon} className="size-4 shrink-0 text-text-muted" />
          <span className="text-sm font-medium">Suscribir en Google Calendar</span>
        </div>
      )}
      <p className="text-xs text-text-secondary">
        Tus tareas con fecha y tus ausencias, en tu calendario. En Google: <strong>Otros calendarios</strong> →{' '}
        <strong>Suscribirse mediante URL</strong>. Es de solo lectura, y Google puede tardar unas horas en reflejar
        cambios.
      </p>

      {/* Oculta por defecto: quien mire la pantalla por encima del hombro se
          llevaría el acceso a la agenda. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          readOnly
          value={revealed ? url : '••••••••••••••••••••••••••••••'}
          onFocus={(e) => e.currentTarget.select()}
          className="basis-full font-mono text-xs @min-[620px]:basis-auto @min-[620px]:flex-1"
          aria-label="URL del calendario"
        />
        <Button size="sm" variant="ghost" onClick={() => setRevealed((v) => !v)}>
          {revealed ? 'Ocultar' : 'Ver'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(url)
            toast.success('Enlace copiado')
          }}
        >
          <HugeiconsIcon icon={Copy01Icon} />
          Copiar
        </Button>
      </div>

      {/* Google no acepta que otra página le pase la URL ya cargada, así que
          "Suscribir" abre la pantalla de agregar-por-URL y el enlace se pega
          a mano — copiarlo primero es parte del flujo, no un paso de más. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(url)
            toast.success('Enlace copiado. Pégalo en Google Calendar.')
            window.open('https://calendar.google.com/calendar/u/0/r/settings/addbyurl', '_blank', 'noopener')
          }}
        >
          <HugeiconsIcon icon={LinkSquare02Icon} />
          Suscribir en Google Calendar
        </Button>
        <span className="text-xs text-text-muted">
          En otros calendarios: <strong className="font-medium">Suscribirse mediante URL</strong>.
        </span>
      </div>

      {lastAccessedAt && (
        <p className="text-xs text-text-muted">Google leyó el enlace por última vez {formatRelativeTime(lastAccessedAt)}.</p>
      )}

      <SettingRow
        icon={Link01Icon}
        title="Regenerar el enlace"
        subtitle="Si lo compartiste por error. El anterior deja de funcionar y hay que volver a suscribirse."
        wrap
        action={
          <Button size="sm" variant="outline" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
            {regenerate.isPending ? 'Regenerando…' : 'Regenerar'}
          </Button>
        }
      />
    </div>
  )
}
