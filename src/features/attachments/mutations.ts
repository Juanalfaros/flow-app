import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { uploadAttachment, deleteAttachment } from '@/features/attachments/api'
import { attachmentsQueryOptions } from '@/features/attachments/queries'

export function useUploadAttachmentMutation(nodeId: string, uploadedBy: string) {
  const queryClient = useQueryClient()
  const key = attachmentsQueryOptions(nodeId).queryKey

  // Sin patch optimista (a diferencia de los comentarios): no hay nada
  // razonable que mostrar antes de que el Worker confirme la subida y
  // devuelva la key real — el archivo no existe en ningún lado todavía.
  return useMutation({
    mutationFn: (file: File) => uploadAttachment(nodeId, file, uploadedBy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteAttachmentMutation(nodeId: string) {
  const queryClient = useQueryClient()
  const key = attachmentsQueryOptions(nodeId).queryKey

  return useMutation({
    mutationFn: (storageKey: string) => deleteAttachment(storageKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (err: Error) => toast.error(err.message),
  })
}
