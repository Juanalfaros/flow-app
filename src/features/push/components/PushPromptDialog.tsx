import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { BellIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth/queries'
import { useCurrentPushSubscription } from '@/features/push/queries'
import { useSubscribeToPushMutation } from '@/features/push/mutations'
import { detectPushSupport } from '@/features/push/support'

function dismissedKey(userId: string) {
  return `flow:push-prompt-seen:${userId}`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'No se pudo completar la acción.'
}

// Instalar la PWA no activa las notificaciones por sí solo — pedir el
// permiso necesita un toque real de la persona (Notification.requestPermission()
// no puede dispararse solo). Sin este modal, ese paso vivía solo en Perfil
// → Notificaciones, y quien instalaba la app esperando avisos automáticos
// nunca llegaba a activarlos porque no sabía que hacía falta ir a buscarlos.
//
// Se muestra una sola vez por dispositivo (Notification.permission y la
// suscripción son por dispositivo, no por cuenta — mismo criterio que el
// resto de features/push): la marca de "ya visto" vive en localStorage,
// separada por userId para no arrastrarse entre cuentas en un dispositivo
// compartido.
export function PushPromptDialog() {
  const { data: session } = useSession()
  const userId = session?.user.id
  const { data: current, isPending: currentPending } = useCurrentPushSubscription()
  const subscribeMutation = useSubscribeToPushMutation(userId)
  const [open, setOpen] = useState(false)

  const support = detectPushSupport()

  useEffect(() => {
    if (!userId || currentPending) return
    // 'needs-install' (iOS en pestaña de Safari) y 'unsupported': nada que
    // ofrecer todavía, mismo criterio que PushControls.
    if (support.kind !== 'supported') return
    // Ya activado en este dispositivo.
    if (current) return
    // Ya lo rechazó antes desde el navegador: insistir con un modal propio
    // no reabre el permiso (Chrome no lo vuelve a preguntar), solo repite
    // el mismo mensaje de "andá a los ajustes del sitio" sin necesidad.
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return
    let seen = false
    try {
      seen = !!localStorage.getItem(dismissedKey(userId))
    } catch {
      // localStorage bloqueado (ventana privada, etc.): tratar como no
      // visto es lo peor que puede pasar es mostrarlo de nuevo la próxima.
    }
    if (!seen) setOpen(true)
  }, [userId, currentPending, current, support.kind])

  function markSeenAndClose() {
    if (userId) {
      try {
        localStorage.setItem(dismissedKey(userId), '1')
      } catch {
        // Sin persistencia el modal puede reaparecer — no es grave.
      }
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && markSeenAndClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={BellIcon} className="size-5 text-accent" />
            <DialogTitle>Activar notificaciones</DialogTitle>
          </div>
          <DialogDescription>
            Recibirás un aviso cuando te asignen algo, te mencionen o cambie una tarea que sigues — incluso con la
            app cerrada.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={markSeenAndClose}>
            Ahora no
          </Button>
          <Button
            type="button"
            disabled={subscribeMutation.isPending}
            onClick={() => {
              subscribeMutation.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Listo, ya recibes notificaciones en este dispositivo.')
                  markSeenAndClose()
                },
                onError: (err) => {
                  toast.error(errorMessage(err))
                  markSeenAndClose()
                },
              })
            }}
          >
            {subscribeMutation.isPending ? 'Un momento…' : 'Activar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
