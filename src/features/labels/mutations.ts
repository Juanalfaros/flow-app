import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addTaskLabel,
  createLabel,
  deleteLabel,
  removeTaskLabel,
  updateLabel,
} from '@/features/labels/api'
import { labelsQueryOptions, type LabelSummary } from '@/features/labels/queries'
import {
  taskDetailQueryOptions,
  tasksListKeyPrefix,
  type TaskLabelSummary,
  type TaskSummary,
} from '@/features/tasks/queries'

export function useCreateLabelMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = labelsQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { name: string; color: string }) =>
      createLabel(workspaceId, vars.name, vars.color),
    onSuccess: (created) => {
      queryClient.setQueryData<LabelSummary[]>(key, (old) => [...(old ?? []), created])
    },
  })
}

export function useUpdateLabelMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = labelsQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { labelId: string; fields: { name?: string; color?: string | null } }) =>
      updateLabel(vars.labelId, vars.fields),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<LabelSummary[]>(key)
      queryClient.setQueryData<LabelSummary[]>(key, (old) =>
        old?.map((l) => (l.id === vars.labelId ? { ...l, ...vars.fields } : l)) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useDeleteLabelMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = labelsQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (labelId: string) => deleteLabel(labelId),
    onMutate: async (labelId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<LabelSummary[]>(key)
      queryClient.setQueryData<LabelSummary[]>(key, (old) => old?.filter((l) => l.id !== labelId) ?? [])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useToggleTaskLabelMutation(projectId: string) {
  const queryClient = useQueryClient()
  // Prefijo (no `.queryKey` exacta): mismo motivo que en
  // `src/features/tasks/mutations.ts` — `tasksQueryOptions` cachea por
  // separado según `includeDescription`, hay que patchear ambas variantes.
  const listKeyPrefix = tasksListKeyPrefix(projectId)

  return useMutation({
    mutationFn: (vars: { taskId: string; label: TaskLabelSummary; assigned: boolean }) =>
      vars.assigned
        ? removeTaskLabel(vars.taskId, vars.label.id)
        : addTaskLabel(vars.taskId, vars.label.id),
    onMutate: async (vars) => {
      const detailKey = taskDetailQueryOptions(vars.taskId).queryKey
      await queryClient.cancelQueries({ queryKey: listKeyPrefix })
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previousLists = queryClient.getQueriesData<TaskSummary[]>({ queryKey: listKeyPrefix })
      const previousDetail = queryClient.getQueryData(detailKey)

      const patchLabels = (task_labels: { label: TaskLabelSummary }[]) =>
        vars.assigned
          ? task_labels.filter((tl) => tl.label.id !== vars.label.id)
          : [...task_labels, { label: vars.label }]

      queryClient.setQueriesData<TaskSummary[]>({ queryKey: listKeyPrefix }, (old) =>
        old?.map((t) => (t.id === vars.taskId ? { ...t, task_labels: patchLabels(t.task_labels) } : t)) ?? [],
      )
      queryClient.setQueryData(detailKey, (old) =>
        old ? { ...old, task_labels: patchLabels(old.task_labels) } : old,
      )
      return { previousLists, previousDetail, detailKey }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (ctx?.previousDetail) queryClient.setQueryData(ctx.detailKey, ctx.previousDetail)
    },
  })
}
