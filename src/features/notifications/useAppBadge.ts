import { useEffect } from 'react'
import { useUnreadNotificationsCount } from '@/features/notifications/queries'

// Badging API: el número de notificaciones sin leer también sobre el
// ícono de la app en la pantalla de inicio, sin necesidad de abrirla —
// Android (Chrome/Edge) y iOS 16.4+ con la PWA instalada. `'setAppBadge'
// in navigator` cubre el resto (desktop sin soporte, Safari de
// escritorio, o iOS en una pestaña normal): ahí simplemente no hace nada,
// sin necesidad de un branch de detección aparte (mismo criterio que
// features/push/support.ts, pero acá un booleano alcanza — a diferencia
// de Push, no hay nada que "instalar para desbloquear": donde falta la
// API, mostrar el número en la campana del topbar sigue funcionando
// igual).
export function useAppBadge(userId: string | undefined) {
  const { data: count } = useUnreadNotificationsCount(userId)

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (!count) {
      void navigator.clearAppBadge()
      return
    }
    void navigator.setAppBadge(count)
  }, [count])
}
