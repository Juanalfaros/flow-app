import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert01Icon,
  CheckmarkCircle02Icon,

  InformationCircleIcon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SettingList, SettingRow } from '@/features/profile/components/settings-ui'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { useCurrentPushSubscription, usePushDevices } from '@/features/push/queries'
import {
  useRemovePushDeviceMutation,
  useSetPushEnabledMutation,
  useSubscribeToPushMutation,
  useUnsubscribeFromPushMutation,
} from '@/features/push/mutations'
import { detectPushSupport, isIos } from '@/features/push/support'
import { formatRelativeTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'

// Nombre legible del dispositivo a partir del user agent. No pretende ser
// exacto —parsear UA nunca lo es— solo lo suficiente para que alguien
// distinga "el teléfono viejo" del navegador que tiene delante.
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo desconocido'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Navegador'
  const platform = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent)
      ? 'iPhone/iPad'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'otro sistema'
  return `${browser} en ${platform}`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'No se pudo completar la acción.'
}

/**
 * "En este dispositivo": activar/desactivar los avisos de ESTE navegador.
 *
 * Separado de `PushDeviceList` en el rediseño de Ajustes (2026-09-25): el
 * mockup los trata como dos secciones distintas —una es una acción sobre el
 * navegador que tienes delante, la otra es el inventario de todos— y antes
 * eran un solo bloque con separadores adentro.
 */
export function PushControls() {
  const { data: session } = useSession()
  const userId = session?.user.id
  const { data: current, isPending: currentPending } = useCurrentPushSubscription()
  const { data: devices } = usePushDevices(userId)

  const subscribeMutation = useSubscribeToPushMutation(userId)
  const unsubscribeMutation = useUnsubscribeFromPushMutation(userId)

  // Se calcula en render y no en un `useEffect`: no depende de nada
  // asíncrono, solo de qué hay en `window` en este momento.
  const support = detectPushSupport()
  const subscribedHere = !!current
  const currentDevice = devices?.find((d) => d.endpoint === current?.endpoint)

  if (support.kind === 'needs-install') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-alt p-3">
          <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-4 shrink-0 text-text-muted" />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Instala la app para recibir avisos</p>
            {/* El requisito es de Apple, no del proyecto: en iPhone y iPad
                las notificaciones web solo funcionan con la web agregada a
                la pantalla de inicio. En una pestaña de Safari la API ni
                siquiera existe, por eso acá no hay botón que ofrecer. */}
            <p className="text-xs text-text-muted">
              En iPhone y iPad, Apple solo permite notificaciones cuando la app está en la pantalla de inicio
              (iOS 16.4 o superior).
            </p>
            <ol className="ml-4 flex list-decimal flex-col gap-1 text-xs text-text-secondary">
              <li>Abre este sitio en Safari (no en Chrome ni otro navegador).</li>
              <li>
                Toca <span className="font-medium">Compartir</span> en la barra inferior.
              </li>
              <li>
                Elige <span className="font-medium">Agregar a pantalla de inicio</span>.
              </li>
              <li>Abre Flow desde el ícono nuevo y vuelve a esta pantalla.</li>
            </ol>
          </div>
        </div>
      </div>
    )
  }

  if (support.kind === 'unsupported') {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-alt p-3">
        <HugeiconsIcon icon={Alert01Icon} className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <div>
          <p className="text-sm">Este navegador no admite notificaciones</p>
          <p className="text-xs text-text-muted">
            Prueba con Chrome, Edge o Firefox. La campana del menú superior sigue funcionando mientras la app
            esté abierta.
          </p>
        </div>
      </div>
    )
  }

  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied'

  return (
    <div className="flex flex-col gap-4">
      <SettingRow
        icon={subscribedHere ? CheckmarkCircle02Icon : SmartPhone01Icon}
        title={subscribedHere ? `Activados en ${describeDevice(navigator.userAgent)}` : 'Este dispositivo'}
        subtitle={
          subscribedHere
            ? currentDevice?.last_success_at
              ? `Último aviso recibido ${formatRelativeTime(currentDevice.last_success_at)}`
              : 'Recibirás avisos aunque la app esté cerrada.'
            : 'Activa para recibir avisos con la app cerrada.'
        }
        wrap
        action={
          <Button
            type="button"
            variant={subscribedHere ? 'outline' : 'default'}
            size="sm"
            disabled={currentPending || subscribeMutation.isPending || unsubscribeMutation.isPending || denied}
            onClick={() => {
              if (subscribedHere) {
                unsubscribeMutation.mutate(undefined, {
                  onSuccess: () => toast.success('Notificaciones desactivadas en este dispositivo.'),
                  onError: (err) => toast.error(errorMessage(err)),
                })
                return
              }
              subscribeMutation.mutate(undefined, {
                onSuccess: () => toast.success('Listo, ya recibes notificaciones en este dispositivo.'),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }}
          >
            {subscribeMutation.isPending || unsubscribeMutation.isPending
              ? 'Un momento…'
              : subscribedHere
                ? 'Desactivar aquí'
                : 'Activar'}
          </Button>
        }
      />

      {/* Un permiso denegado no se puede volver a pedir por código: el
          navegador ni siquiera muestra el diálogo. Hay que decir dónde
          está el interruptor real. */}
      {denied && (
        <div className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger/5 p-3">
          <HugeiconsIcon icon={Alert01Icon} className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm">Las notificaciones están bloqueadas para este sitio</p>
            <p className="text-xs text-text-muted">
              {isIos()
                ? 'Ve a Ajustes › Notificaciones › Flow y permítelas.'
                : 'Toca el candado junto a la dirección del sitio y permite las notificaciones. Después vuelve acá.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/** "Tus dispositivos": inventario de todo lo suscrito + el silencio global. */
export function PushDeviceList() {
  const { data: session } = useSession()
  const userId = session?.user.id
  const { data: profile } = useProfile(userId ?? '')
  const { data: current } = useCurrentPushSubscription()
  const { data: devices } = usePushDevices(userId)

  const removeDeviceMutation = useRemovePushDeviceMutation(userId)
  const setEnabledMutation = useSetPushEnabledMutation(userId)
  const enabledGlobally = profile?.push_enabled ?? true

  return (
    <div className="flex flex-col gap-3.5">
      {devices && devices.length > 0 ? (
        <SettingList>
          {devices.map((device) => {
            const isCurrent = device.endpoint === current?.endpoint
            const failing = device.failure_count >= 3
            return (
              <SettingRow
                key={device.id}
                icon={SmartPhone01Icon}
                title={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate">{describeDevice(device.user_agent)}</span>
                    {isCurrent && (
                      <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] font-normal text-text-secondary">
                        este
                      </span>
                    )}
                  </span>
                }
                subtitle={
                  <span className={cn(failing && 'text-warn-text')}>
                    {failing
                      ? `${device.failure_count} avisos fallidos seguidos · puede que ya no exista`
                      : device.last_success_at
                        ? `Último aviso ${formatRelativeTime(device.last_success_at)}`
                        : 'Sin avisos aún'}
                  </span>
                }
                action={
                  !isCurrent && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removeDeviceMutation.isPending}
                      onClick={() =>
                        removeDeviceMutation.mutate(device.id, {
                          onError: (err) => toast.error(errorMessage(err)),
                        })
                      }
                    >
                      Quitar
                    </Button>
                  )
                }
              />
            )
          })}
        </SettingList>
      ) : (
        <p className="text-xs text-text-muted">Ningún dispositivo suscrito todavía.</p>
      )}

      {/* Interruptor global, separado del de este dispositivo: sirve para
          silenciar todo (vacaciones) sin tener que desuscribir cada
          teléfono y volver a conceder permisos después. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={!enabledGlobally}
          disabled={setEnabledMutation.isPending || !userId}
          onClick={() =>
            setEnabledMutation.mutate(!enabledGlobally, {
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        >
          {enabledGlobally ? 'Silenciar en todos mis dispositivos' : 'Reactivar en todos mis dispositivos'}
        </Button>
        <span className="text-xs text-text-muted">La campana de la app sigue mostrando todo.</span>
      </div>
    </div>
  )
}
