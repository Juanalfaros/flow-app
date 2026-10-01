import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface RecentViewRow {
  node_id: string
  viewed_at: string
  node: { id: string; title: string; memberships: { container_id: string }[] } | null
}

export const recentViewsQueryOptions = (userId: string | undefined, limit = 10) =>
  queryOptions({
    queryKey: ['recent-views', userId, limit] as const,
    queryFn: async (): Promise<RecentViewRow[]> => {
      const { data, error } = await supabase
        .from('recent_views')
        .select(
          `
          node_id, viewed_at,
          node:nodes ( id, title, memberships:node_memberships!node_memberships_node_id_fkey ( container_id ) )
        `,
        )
        .eq('user_id', userId as string)
        .order('viewed_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as unknown as RecentViewRow[]
    },
    enabled: !!userId,
  })

export function useRecentViews(userId: string | undefined, limit?: number) {
  return useQuery(recentViewsQueryOptions(userId, limit))
}
