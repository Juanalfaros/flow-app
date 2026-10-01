import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createTimeEntry, deleteTimeEntry, type NewTimeEntryInput } from '@/features/time-tracking/api'
import { timeEntriesQueryOptions, type TimeEntrySummary } from '@/features/time-tracking/queries'

export function useCreateTimeEntryMutation(nodeId: string, userLabel: string) {
  const queryClient = useQueryClient()
  const key = timeEntriesQueryOptions(nodeId).queryKey

  return useMutation({
    mutationFn: (input: Omit<NewTimeEntryInput, 'nodeId'>) => createTimeEntry({ ...input, nodeId }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TimeEntrySummary[]>(key)
      const tempId = crypto.randomUUID()
      const optimistic: TimeEntrySummary = {
        id: tempId,
        node_id: nodeId,
        user_id: input.userId,
        minutes: input.minutes,
        entry_date: input.entryDate,
        note: input.note ?? null,
        created_at: new Date().toISOString(),
        user: { id: input.userId, full_name: userLabel, avatar_url: null },
      }
      queryClient.setQueryData<TimeEntrySummary[]>(key, (old) => [optimistic, ...(old ?? [])])
      return { previous, tempId }
    },
    onSuccess: (created, _input, ctx) => {
      queryClient.setQueryData<TimeEntrySummary[]>(
        key,
        (old) => old?.map((e) => (e.id === ctx?.tempId ? created : e)) ?? [],
      )
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      toast.error('No se pudo registrar el tiempo.')
    },
  })
}

export function useDeleteTimeEntryMutation(nodeId: string) {
  const queryClient = useQueryClient()
  const key = timeEntriesQueryOptions(nodeId).queryKey

  return useMutation({
    mutationFn: (entryId: string) => deleteTimeEntry(entryId),
    onMutate: async (entryId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TimeEntrySummary[]>(key)
      queryClient.setQueryData<TimeEntrySummary[]>(key, (old) => old?.filter((e) => e.id !== entryId) ?? [])
      return { previous }
    },
    onError: (_err, _entryId, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      toast.error('No se pudo eliminar el registro.')
    },
  })
}
