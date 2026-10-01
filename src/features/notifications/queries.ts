import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/features/nodes/types'

export type NotificationType =
  | 'assigned'
  | 'status_changed'
  | 'comment'
  | 'mention'
  | 'watched_activity'
  | 'unblocked'
  | 'due_reminder'
  | 'removed_from_workspace'
  | 'role_changed'
  | 'welcome'
  | 'subtask_resolved'
  | 'task_claimed'

export interface NotificationRow {
  id: string
  type: NotificationType
  node_id: string | null
  actor: { full_name: string | null; avatar_url: string | null } | null
  payload: Json
  created_at: string
  read_at: string | null
  node: { id: string; title: string; memberships: { container_id: string }[] } | null
}

const NOTIFICATION_SELECT = `
  id, type, node_id, payload, created_at, read_at,
  actor:profiles!notifications_actor_id_fkey ( full_name, avatar_url ),
  node:nodes ( id, title, memberships:node_memberships!node_memberships_node_id_fkey ( container_id ) )
`

export const notificationsQueryOptions = (userId: string | undefined, opts: { unreadOnly?: boolean } = {}) =>
  queryOptions({
    queryKey: ['notifications', userId, opts.unreadOnly ?? false] as const,
    queryFn: async (): Promise<NotificationRow[]> => {
      const base = supabase.from('notifications').select(NOTIFICATION_SELECT).eq('recipient_id', userId as string)
      const { data, error } = await (opts.unreadOnly ? base.is('read_at', null) : base)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as unknown as NotificationRow[]
    },
    enabled: !!userId,
  })

export function useNotifications(userId: string | undefined, opts?: { unreadOnly?: boolean }) {
  return useQuery(notificationsQueryOptions(userId, opts))
}

// S-17: el badge del sidebar usaba `unreadOnly.length` sobre una lista
// topeada en 50 (`.limit(50)` arriba) — con 50+ notificaciones sin leer
// mostraba "50" para siempre, sin importar cuántas hubiera en verdad.
// `count: 'exact', head: true` no trae filas, solo el conteo real.
export const unreadNotificationsCountQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['notifications', 'unread-count', userId] as const,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId as string)
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!userId,
  })

export function useUnreadNotificationsCount(userId: string | undefined) {
  return useQuery(unreadNotificationsCountQueryOptions(userId))
}
