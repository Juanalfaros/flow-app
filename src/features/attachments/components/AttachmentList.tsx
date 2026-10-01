import { useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Attachment01Icon,
  File01Icon,
  Image01Icon,
  Pdf01Icon,
  Doc01Icon,
  GoogleSheetIcon,
  Delete02Icon,
  Download01Icon,
  Loading02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAttachments, useAttachmentThumbnail, type AttachmentSummary } from '@/features/attachments/queries'
import { useUploadAttachmentMutation, useDeleteAttachmentMutation } from '@/features/attachments/mutations'
import { openAttachment } from '@/features/attachments/api'
import { initials } from '@/lib/initials'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// `content_type` ya se pedía en attachmentsQueryOptions y nunca se usaba —
// AttachmentList dibujaba el mismo ícono genérico para cualquier archivo.
// 5-6 familias alcanzan, no hace falta un ícono por extensión.
function attachmentIcon(contentType: string | null): IconSvgElement {
  if (!contentType) return File01Icon
  if (contentType.startsWith('image/')) return Image01Icon
  if (contentType === 'application/pdf') return Pdf01Icon
  if (contentType.includes('spreadsheet') || contentType === 'text/csv') return GoogleSheetIcon
  if (contentType.includes('word') || contentType.includes('document')) return Doc01Icon
  return File01Icon
}

// Miniatura real para `image/*`: el bucket de R2 es privado (mismo motivo
// que openAttachment en api.ts — no hay URL pública/firmada, todo pasa por
// el Worker con JWT), así que no alcanza con un <img src="...">  directo.
// Sin infra de resize server-side, la "miniatura" es la imagen real
// escalada por CSS — mientras carga o si falla, cae al ícono genérico.
function AttachmentThumbnail({ attachment }: { attachment: AttachmentSummary }) {
  const isImage = attachment.content_type?.startsWith('image/') ?? false
  const { data: objectUrl } = useAttachmentThumbnail(attachment.storage_key, isImage)

  if (isImage && objectUrl) {
    return (
      <img
        src={objectUrl}
        alt=""
        className="size-6 shrink-0 rounded-sm border border-border object-cover"
      />
    )
  }
  return (
    <HugeiconsIcon
      icon={attachmentIcon(attachment.content_type)}
      className="size-4 shrink-0 text-text-muted"
    />
  )
}

interface AttachmentListProps {
  nodeId: string
  currentUserId: string | undefined
}

export function AttachmentList({ nodeId, currentUserId }: AttachmentListProps) {
  const { data: attachments, isPending } = useAttachments(nodeId)
  const uploadMutation = useUploadAttachmentMutation(nodeId, currentUserId ?? '')
  const deleteMutation = useDeleteAttachmentMutation(nodeId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  // Sin patch optimista de verdad (ver el comentario en mutations.ts: no
  // hay storage_key todavía, nada real que insertar en la caché) — pero
  // `uploadMutation.variables` retiene el File que se mandó mientras la
  // mutación sigue en vuelo, así que alcanza para una fila "fantasma" con
  // nombre/tamaño reales y un spinner en vez de nada. Antes el único
  // indicador era el texto del botón ("Subiendo…"), sin ningún movimiento
  // — reportado por el usuario como "pareciera no pasar nada".
  const uploadingFile = uploadMutation.isPending ? uploadMutation.variables : undefined

  function handleFile(file: File | undefined) {
    if (!file) return
    uploadMutation.mutate(file)
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md',
        // Highlight de la zona completa mientras se arrastra un archivo
        // encima — no solo el botón de abajo, cualquier punto de la lista
        // sirve para soltar.
        isDraggingOver && 'outline-2 outline-dashed outline-accent outline-offset-4',
      )}
      onDragOver={(e) => {
        if (!currentUserId) return
        e.preventDefault()
        setIsDraggingOver(true)
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDraggingOver(false)
        if (!currentUserId) return
        handleFile(e.dataTransfer.files[0])
      }}
    >
      {isPending ? (
        <Skeleton className="h-10" />
      ) : (attachments && attachments.length > 0) || uploadingFile ? (
        <ul className="flex flex-col gap-1">
          {attachments?.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-alt">
              <AttachmentThumbnail attachment={a} />
              <button
                type="button"
                onClick={() => openAttachment(a.storage_key, a.filename)}
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                title={a.filename}
              >
                {a.filename}
              </button>
              <span className="shrink-0 text-xs text-text-muted">{formatBytes(a.size_bytes)}</span>
              <Avatar size="sm" className="shrink-0">
                {a.uploader?.avatar_url && <AvatarImage src={a.uploader.avatar_url} alt="" />}
                <AvatarFallback className="text-[10px]">{initials(a.uploader?.full_name ?? null)}</AvatarFallback>
              </Avatar>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Descargar ${a.filename}`}
                onClick={() => openAttachment(a.storage_key, a.filename)}
              >
                <HugeiconsIcon icon={Download01Icon} />
              </Button>
              {a.uploaded_by === currentUserId && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Eliminar ${a.filename}`}
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(a.storage_key)}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              )}
            </li>
          ))}
          {uploadingFile && (
            <li className="flex items-center gap-2 rounded-md px-1.5 py-1 text-text-muted">
              <HugeiconsIcon icon={Loading02Icon} className="size-4 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1 truncate text-sm">{uploadingFile.name}</span>
              <span className="shrink-0 text-xs">{formatBytes(uploadingFile.size)}</span>
            </li>
          )}
        </ul>
      ) : (
        <p className="text-xs text-text-muted">
          {isDraggingOver ? 'Suelta para subir…' : 'Sin adjuntos todavía.'}
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          handleFile(file)
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={uploadMutation.isPending || !currentUserId}
        onClick={() => fileInputRef.current?.click()}
      >
        <HugeiconsIcon
          icon={uploadMutation.isPending ? Loading02Icon : Attachment01Icon}
          className={cn(uploadMutation.isPending && 'animate-spin')}
        />
        {uploadMutation.isPending ? 'Subiendo…' : 'Agregar archivo, o arrastralo acá'}
      </Button>
    </div>
  )
}
