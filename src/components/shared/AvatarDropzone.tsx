import { useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Camera01Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

// Extraído de profile.tsx (era local a IdentitySection) al sumar el
// formulario de edición de perfil de OTRO miembro (EditMemberDialog,
// features/people) — mismo control visual, dos formularios distintos.
export function AvatarDropzone({
  avatarUrl,
  fallbackText,
  uploading,
  onFile,
}: {
  avatarUrl: string | null
  fallbackText: string
  uploading: boolean
  onFile: (file: File) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function pick(file: File | undefined) {
    if (file && file.type.startsWith('image/')) onFile(file)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Cambiar foto, haz clic o arrastra una imagen"
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
        pick(e.dataTransfer.files?.[0])
      }}
      className={cn(
        'group relative flex size-16 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-shadow',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        isDragging && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
      )}
    >
      <Avatar size="lg" className="size-16">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="text-base">{fallbackText}</AvatarFallback>
      </Avatar>
      <div
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100',
          isDragging && 'bg-accent/50 opacity-100',
        )}
      >
        <HugeiconsIcon icon={Camera01Icon} className="size-5 text-white" />
      </div>
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
          <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          pick(file)
        }}
      />
    </div>
  )
}
