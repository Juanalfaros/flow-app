import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type LabelSummary = Pick<Database['public']['Tables']['labels']['Row'], 'id' | 'workspace_id' | 'name' | 'color'>

export const labelsQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['labels', workspaceId] as const,
    queryFn: async (): Promise<LabelSummary[]> => {
      const { data, error } = await supabase
        .from('labels')
        .select('id, workspace_id, name, color')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

export function useLabels(workspaceId: string) {
  return useQuery(labelsQueryOptions(workspaceId))
}
