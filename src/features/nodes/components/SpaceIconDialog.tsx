import { useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Camera01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NodeIconSwatch } from '@/features/nodes/components/NodeIconSwatch'
import { NODE_ICON_PRESETS, DEFAULT_NODE_ICON } from '@/features/nodes/icon-presets'
import { TAG_PALETTE } from '@/features/labels/tag-colors'
import { useUpdateNodeAppearanceMutation, useUploadNodeIconMutation } from '@/features/nodes/mutations'
import type { NodeAppearance } from '@/features/nodes/types'
import { cn } from '@/lib/utils'

interface SpaceIconDialogProps {
  workspaceId: string
  nodeId: string
  nodeName: string
  appearance: NodeAppearance | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SpaceIconDialog({
  workspaceId,
  nodeId,
  nodeName,
  appearance,
  open,
  onOpenChange,
}: SpaceIconDialogProps) {
  const updateMutation = useUpdateNodeAppearanceMutation(workspaceId)
  const uploadMutation = useUploadNodeIconMutation(workspaceId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const currentColor = appearance?.kind === 'preset' ? appearance.color : TAG_PALETTE[0].hex
  const currentIcon = appearance?.kind === 'preset' ? appearance.icon : DEFAULT_NODE_ICON.name

  function setPreset(next: Partial<{ icon: string; color: string }>) {
    updateMutation.mutate({
      nodeId,
      appearance: { kind: 'preset', icon: next.icon ?? currentIcon, color: next.color ?? currentColor },
    })
  }

  function pickFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    uploadMutation.mutate(
      { nodeId, file },
      { onError: () => toast.error('No se pudo subir la imagen. Prueba con otra.') },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ícono del espacio</DialogTitle>
          <p className="text-xs text-text-muted">{nodeName}</p>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <NodeIconSwatch name={nodeName} appearance={appearance} size="md" />
          <div
            role="button"
            tabIndex={0}
            aria-label="Subir imagen para el ícono, haz clic o arrastra una imagen"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              pickFile(e.dataTransfer.files?.[0])
            }}
            className={cn(
              'flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-text-muted outline-none transition-colors hover:border-accent/50',
              isDragging && 'border-accent bg-accent-soft/40',
            )}
          >
            <HugeiconsIcon icon={Camera01Icon} className="size-4 shrink-0" />
            {uploadMutation.isPending ? 'Subiendo…' : 'Subir imagen (arrastra o haz clic)'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                pickFile(file)
              }}
            />
          </div>
        </div>
        {appearance?.kind === 'image' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => setPreset({})}
          >
            Quitar imagen
          </Button>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-muted uppercase">Ícono</span>
          <div className="grid grid-cols-8 gap-1">
            {NODE_ICON_PRESETS.map(({ name, icon }) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                onClick={() => setPreset({ icon: name })}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt',
                  appearance?.kind === 'preset' && appearance.icon === name && 'bg-accent-soft text-accent ring-1 ring-accent',
                )}
              >
                <HugeiconsIcon icon={icon} className="size-4" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-muted uppercase">Color de fondo</span>
          <div className="flex flex-wrap gap-1.5">
            {TAG_PALETTE.map(({ name, hex }) => (
              <button
                key={hex}
                type="button"
                aria-label={`Color ${name}`}
                title={name}
                className={cn(
                  'size-5 rounded-full border border-border transition-transform hover:scale-110',
                  currentColor === hex && appearance?.kind !== 'image' && 'ring-2 ring-offset-1 ring-text',
                )}
                style={{ backgroundColor: hex }}
                onClick={() => setPreset({ color: hex })}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
