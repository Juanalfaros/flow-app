import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { fetchAttachmentObjectUrl } from '@/features/attachments/api'
import { queryClient } from '@/lib/query-client'

export interface AttachmentSummary {
  id: string
  node_id: string
  storage_key: string
  filename: string
  content_type: string | null
  size_bytes: number
  uploaded_by: string
  created_at: string
  uploader: Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'avatar_url'> | null
}

export const attachmentsQueryOptions = (nodeId: string) =>
  queryOptions({
    queryKey: ['attachments', nodeId] as const,
    queryFn: async (): Promise<AttachmentSummary[]> => {
      const { data, error } = await supabase
        .from('task_attachments')
        .select(
          'id, node_id, storage_key, filename, content_type, size_bytes, uploaded_by, created_at, uploader:profiles!task_attachments_uploaded_by_fkey(id, full_name, avatar_url)',
        )
        .eq('node_id', nodeId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!nodeId,
  })

export function useAttachments(nodeId: string) {
  return useQuery(attachmentsQueryOptions(nodeId))
}

// gcTime finito (no Infinity): el archivo detrás de un `storage_key` nunca
// cambia de contenido (reemplazar un adjunto es borrar + subir uno nuevo,
// con `storage_key` nuevo — ver deleteAttachment/uploadAttachment), así que
// `staleTime: Infinity` sigue teniendo sentido — nunca hace falta re-pedir
// la miniatura mientras la entrada siga en cache. Pero cada miniatura carga
// un `URL.createObjectURL` (ver fetchAttachmentObjectUrl, api.ts), y con
// `gcTime: Infinity` ese blob URL quedaba vivo para siempre mientras durara
// la pestaña — nada lo revocaba (comparar con `openAttachment`, que sí hace
// `revokeObjectURL` a los 10s). El listener de abajo lo revoca recién
// cuando React Query expulsa la entrada de verdad (nadie la pidió en 5
// minutos y no queda ningún componente observándola).
const ATTACHMENT_THUMB_GC_TIME = 5 * 60 * 1000

queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'removed' || event.query.queryKey[0] !== 'attachment-thumb') return
  const url = event.query.state.data
  if (typeof url === 'string') URL.revokeObjectURL(url)
})

export function useAttachmentThumbnail(storageKey: string, enabled: boolean) {
  return useQuery({
    queryKey: ['attachment-thumb', storageKey] as const,
    queryFn: () => fetchAttachmentObjectUrl(storageKey),
    enabled,
    staleTime: Infinity,
    gcTime: ATTACHMENT_THUMB_GC_TIME,
  })
}
