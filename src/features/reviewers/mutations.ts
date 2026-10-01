import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addTaskReviewer, decideTaskReview, removeTaskReviewer } from '@/features/reviewers/api'
import { taskReviewersQueryOptions, type TaskReviewerRow } from '@/features/reviewers/queries'

export function useToggleTaskReviewerMutation(taskId: string) {
  const queryClient = useQueryClient()
  const key = taskReviewersQueryOptions(taskId).queryKey

  return useMutation({
    mutationFn: (vars: { reviewer: TaskReviewerRow; assigned: boolean }) =>
      vars.assigned
        ? removeTaskReviewer(taskId, vars.reviewer.user_id)
        : addTaskReviewer(taskId, vars.reviewer.user_id),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TaskReviewerRow[]>(key)
      queryClient.setQueryData<TaskReviewerRow[]>(key, (old) =>
        vars.assigned
          ? (old ?? []).filter((r) => r.user_id !== vars.reviewer.user_id)
          : [...(old ?? []), vars.reviewer],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

// Sin optimistic update: aprobar/rechazar es una acción deliberada y poco
// frecuente por tarea — se refleja recién con la respuesta real del
// servidor, igual criterio que useAddDependencyMutation
// (features/tasks/dependencies/mutations.ts).
export function useDecideTaskReviewMutation(taskId: string) {
  const queryClient = useQueryClient()
  const key = taskReviewersQueryOptions(taskId).queryKey

  return useMutation({
    mutationFn: (approved: boolean) => decideTaskReview(taskId, approved),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
