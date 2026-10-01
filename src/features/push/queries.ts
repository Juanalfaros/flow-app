import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getExistingSubscription } from '@/features/push/api'

export interface PushDeviceRow {
  id: string
  endpoint: string
  user_agent: string | null
  created_at: string
  last_success_at: string | null
  failure_count: number
}

/** Dispositivos suscritos de esta persona, para la lista del perfil.
 *  `failure_count` (0050_push_subscriptions.sql) era diagnóstico interno,
 *  nunca mostrado — el rediseño de Ajustes PR 3 lo suma acá para avisar
 *  "puede que este dispositivo ya no exista" en vez de fallar en silencio
 *  hasta que el push service lo expire con un 404/410. */
export const pushDevicesQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['push-devices', userId] as const,
    queryFn: async (): Promise<PushDeviceRow[]> => {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, user_agent, created_at, last_success_at, failure_count')
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })

export function usePushDevices(userId: string | undefined) {
  return useQuery(pushDevicesQueryOptions(userId))
}

/**
 * Endpoint suscrito en ESTE navegador, o null.
 *
 * Vive en el cache de Query y no en un `useState` para que el botón de
 * activar y la lista de dispositivos se enteren del mismo cambio sin
 * pasarse estado entre componentes.
 *
 * `staleTime: 0` a propósito: el default global del proyecto es
 * `Infinity`, y acá la fuente de verdad es el navegador, que puede
 * cambiar por fuera de React (permiso revocado desde los ajustes del
 * sitio, datos borrados). Conviene revalidar al montar y al volver a la
 * pestaña.
 */
export const currentPushSubscriptionQueryOptions = () =>
  queryOptions({
    queryKey: ['push-subscription', 'current'] as const,
    queryFn: async (): Promise<{ endpoint: string } | null> => {
      const subscription = await getExistingSubscription()
      return subscription ? { endpoint: subscription.endpoint } : null
    },
    staleTime: 0,
  })

export function useCurrentPushSubscription() {
  return useQuery(currentPushSubscriptionQueryOptions())
}
