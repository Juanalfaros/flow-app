import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createComment, deleteComment } from '@/features/comments/api'
import { commentsQueryOptions, type CommentSummary } from '@/features/comments/queries'

// `parentId` fijo por instancia del hook (no por submit): CommentForm.tsx
// monta una instancia nueva para "Responder a X" con su propio parentId,
// en vez de que el mismo formulario cambie de destino en cada envío.
export function useCreateCommentMutation(
  taskId: string,
  authorId: string,
  authorLabel: string,
  parentId: string | null = null,
) {
  const queryClient = useQueryClient()
  const key = commentsQueryOptions(taskId).queryKey

  return useMutation({
    mutationFn: (vars: { body: string; mentionedUserIds?: string[] }) =>
      createComment(taskId, authorId, vars.body, vars.mentionedUserIds, parentId),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CommentSummary[]>(key)
      const tempId = crypto.randomUUID()
      const optimistic: CommentSummary = {
        id: tempId,
        node_id: taskId,
        author_id: authorId,
        body: vars.body,
        created_at: new Date().toISOString(),
        parent_id: parentId,
        author: { id: authorId, full_name: authorLabel, avatar_url: null },
      }
      queryClient.setQueryData<CommentSummary[]>(key, (old) => [...(old ?? []), optimistic])
      return { previous, tempId }
    },
    onSuccess: (created, _body, ctx) => {
      queryClient.setQueryData<CommentSummary[]>(
        key,
        (old) => old?.map((c) => (c.id === ctx?.tempId ? created : c)) ?? [],
      )
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useDeleteCommentMutation(taskId: string) {
  const queryClient = useQueryClient()
  const key = commentsQueryOptions(taskId).queryKey

  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CommentSummary[]>(key)
      queryClient.setQueryData<CommentSummary[]>(key, (old) => old?.filter((c) => c.id !== commentId) ?? [])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      toast.error('No se pudo eliminar el comentario.')
    },
  })
}
