import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// A diferencia de `useContainerRealtimeChannel` (src/lib/realtime.ts),
// que parchea el cache a mano fila por fila para no perder el drag de
// otro usuario en pleno vuelo, acá alcanza con invalidar: las
// notificaciones no se arrastran ni reordenan, llegan con baja
// frecuencia, y el payload de Postgres Changes no trae los joins
// (actor/node) que la lista necesita para renderizar — replicar el
// patrón de "fetch puntual de 1 fila" de ese archivo sería más código
// para el mismo resultado.
//
// Lo que sí se comparte con ese archivo es el resync al volver: Android
// congela el proceso de la PWA al mandarla a segundo plano y el
// WebSocket muere. Postgres Changes NO reenvía lo perdido, y el
// `QueryClient` de este proyecto corre con `staleTime: Infinity`, así
// que ni el refetch por foco ni el de reconexión de TanStack Query se
// disparan solos. Sin este resync, volver a la app dejaba la campana
// mostrando el contador de antes hasta que llegara una notificación
// nueva o se recargara la app entera.
export function useNotificationsRealtimeChannel(userId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    let active = true
    let channel: RealtimeChannel | null = null

    function invalidate() {
      if (!active) return
      // Prefijo `['notifications']` a secas, no `['notifications', userId]`:
      // `unreadNotificationsCountQueryOptions` (S-17) usa
      // `['notifications', 'unread-count', userId]` — un match por
      // posición contra `['notifications', userId]` nunca coincide (el
      // segundo elemento es 'unread-count', no el userId), así que ese
      // conteo exacto nunca se invalidaba por Realtime y solo se refrescaba
      // al recargar la app entera. Bug encontrado al conectar el badge del
      // ícono (Badging API) a este mismo conteo.
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }

    function subscribe() {
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
          invalidate,
        )
        .subscribe()
    }

    function resyncAndResubscribe() {
      if (channel) supabase.removeChannel(channel)
      channel = null
      if (!active) return
      // Una sola relectura al volver: cubre todo lo que entró mientras el
      // canal estuvo cerrado.
      invalidate()
      subscribe()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (channel) supabase.removeChannel(channel)
        channel = null
      } else {
        resyncAndResubscribe()
      }
    }

    subscribe()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', resyncAndResubscribe)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', resyncAndResubscribe)
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}
