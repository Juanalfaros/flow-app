import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TaskWatcherRow {
  user_id: string
}

export const taskWatchersQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: ['task-watchers', taskId] as const,
    queryFn: async (): Promise<TaskWatcherRow[]> => {
      const { data, error } = await supabase.from('task_watchers').select('user_id').eq('node_id', taskId)
      if (error) throw error
      return data
    },
    enabled: !!taskId,
  })

export function useTaskWatchers(taskId: string) {
  return useQuery(taskWatchersQueryOptions(taskId))
}
