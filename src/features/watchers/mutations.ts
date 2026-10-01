import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addTaskWatcher, removeTaskWatcher } from '@/features/watchers/api'
import { taskWatchersQueryOptions, type TaskWatcherRow } from '@/features/watchers/queries'

// Toggle simple (seguir/dejar de seguir), sin picker de otras personas —
// mismo criterio que un "Watch" de Jira/Linear: cada quien gestiona su
// propio seguimiento.
export function useToggleTaskWatcherMutation(taskId: string, userId: string | undefined) {
  const queryClient = useQueryClient()
  const key = taskWatchersQueryOptions(taskId).queryKey

  return useMutation({
    mutationFn: (watching: boolean) => {
      if (!userId) throw new Error('No hay sesión activa')
      return watching ? removeTaskWatcher(taskId, userId) : addTaskWatcher(taskId, userId)
    },
    onMutate: async (watching) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TaskWatcherRow[]>(key)
      queryClient.setQueryData<TaskWatcherRow[]>(key, (old) =>
        watching ? (old ?? []).filter((w) => w.user_id !== userId) : [...(old ?? []), { user_id: userId! }],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}
