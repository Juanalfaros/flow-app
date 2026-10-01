import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { setPushEnabled, subscribeToPush, unsubscribeFromPush } from '@/features/push/api'

function invalidatePush(queryClient: ReturnType<typeof useQueryClient>, userId: string | undefined) {
  void queryClient.invalidateQueries({ queryKey: ['push-subscription', 'current'] })
  void queryClient.invalidateQueries({ queryKey: ['push-devices', userId] })
}

export function useSubscribeToPushMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Sin sesión.')
      await subscribeToPush(userId)
      // Activar en un dispositivo reactiva la preferencia global: si
      // estaba apagada, suscribirse y no recibir nada sería un botón que
      // miente.
      await setPushEnabled(userId, true)
    },
    onSuccess: () => {
      invalidatePush(queryClient, userId)
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })
}

export function useUnsubscribeFromPushMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: unsubscribeFromPush,
    onSuccess: () => invalidatePush(queryClient, userId),
  })
}

/** Borra un dispositivo de la lista (uno distinto del actual, típicamente
 *  un teléfono viejo). No toca el navegador local. */
export function useRemovePushDeviceMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('push_subscriptions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidatePush(queryClient, userId),
  })
}

export function useSetPushEnabledMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => {
      if (!userId) throw new Error('Sin sesión.')
      return setPushEnabled(userId, enabled)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  })
}
