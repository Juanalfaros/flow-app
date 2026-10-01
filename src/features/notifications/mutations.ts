import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { NotificationRow } from '@/features/notifications/queries'

async function markNotificationRead(notificationId: string, userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', userId)
  if (error) throw error
}

async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('read_at', null)
  if (error) throw error
}

// Toca las 2 variantes cacheadas (unreadOnly true/false, ver
// notificationsQueryOptions) — a diferencia de tasksListKeyPrefix (que
// solo agrega/quita un campo, un simple .map() alcanza para ambas
// variantes), acá `unreadOnly` cambia el CRITERIO de pertenencia: una
// notificación recién marcada leída tiene que desaparecer de la lista
// "no leídas" pero seguir presente (con read_at seteado) en la lista
// "todas". Por eso se itera `getQueriesData` a mano en vez de un
// `setQueriesData` uniforme — cada key sabe su propio `unreadOnly` (3er
// elemento de la queryKey) y decide filter vs. map.
function keyPrefix(userId: string | undefined) {
  return ['notifications', userId] as const
}

function patchNotificationsCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  prefix: readonly [string, string | undefined],
  markRead: (n: NotificationRow) => boolean,
  now: string,
) {
  const entries = queryClient.getQueriesData<NotificationRow[]>({ queryKey: prefix })
  for (const [key, data] of entries) {
    if (!data) continue
    const unreadOnly = key[2] === true
    const updated = data
      .map((n) => (markRead(n) ? { ...n, read_at: now } : n))
      .filter((n) => !unreadOnly || !n.read_at)
    queryClient.setQueryData(key, updated)
  }
  return entries
}

export function useMarkNotificationReadMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  const prefix = keyPrefix(userId)

  return useMutation({
    mutationFn: (notificationId: string) => {
      if (!userId) throw new Error('No hay sesión activa')
      return markNotificationRead(notificationId, userId)
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: prefix })
      const previous = queryClient.getQueriesData<NotificationRow[]>({ queryKey: prefix })
      patchNotificationsCaches(queryClient, prefix, (n) => n.id === notificationId, new Date().toISOString())
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
  })
}

export function useMarkAllNotificationsReadMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  const prefix = keyPrefix(userId)

  return useMutation({
    mutationFn: () => {
      if (!userId) throw new Error('No hay sesión activa')
      return markAllNotificationsRead(userId)
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: prefix })
      const previous = queryClient.getQueriesData<NotificationRow[]>({ queryKey: prefix })
      patchNotificationsCaches(queryClient, prefix, (n) => !n.read_at, new Date().toISOString())
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
  })
}
