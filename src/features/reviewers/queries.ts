import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type ProfileSummary = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'avatar_url'>

export interface TaskReviewerRow {
  id: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  reviewer: ProfileSummary
}

export const taskReviewersQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: ['task-reviewers', taskId] as const,
    queryFn: async (): Promise<TaskReviewerRow[]> => {
      const { data, error } = await supabase
        .from('task_reviewers')
        .select('id, user_id, status, reviewer:profiles!task_reviewers_user_id_fkey ( id, full_name, avatar_url )')
        .eq('node_id', taskId)
      if (error) throw error
      return data as unknown as TaskReviewerRow[]
    },
    enabled: !!taskId,
  })

export function useTaskReviewers(taskId: string) {
  return useQuery(taskReviewersQueryOptions(taskId))
}
