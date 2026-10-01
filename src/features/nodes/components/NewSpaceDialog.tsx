import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateSpaceMutation } from '@/features/nodes/mutations'

interface NewSpaceDialogProps {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// F-01: mismo patrón que NewFolderDialog — un espacio no tiene padre que
// elegir (es la raíz del árbol), así que el formulario es más simple
// todavía: solo el nombre.
//
// FormDialog (no Dialog/DialogContent/DialogFooter): en mobile, con el
// teclado abierto, la caja centrada de siempre quedaba comprimida contra la
// topbar y el botón "Crear" del footer se iba abajo del teclado. FormDialog
// resuelve eso siendo pantalla completa en mobile, con Cancelar/Crear en
// una cabecera fija que el teclado no puede tapar — ver
// src/components/ui/form-dialog.tsx. En escritorio se ve idéntico a antes.
export function NewSpaceDialog({ workspaceId, open, onOpenChange }: NewSpaceDialogProps) {
  const [name, setName] = useState('')
  const mutation = useCreateSpaceMutation(workspaceId)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo espacio"
      submitLabel={mutation.isPending ? 'Creando…' : 'Crear'}
      submitDisabled={mutation.isPending}
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate(
          { title: name },
          {
            onError: () => toast.error('No se pudo crear el espacio.'),
            onSuccess: () => {
              setName('')
              onOpenChange(false)
            },
          },
        )
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="space-name">Nombre</Label>
        <Input
          id="space-name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Espacio nuevo"
          // h-11: objetivo táctil real en mobile (el `Input` base mide 32px,
          // pensado para mouse). El anti-zoom de iOS (texto ≥16px mientras
          // el input está enfocado) ya es el default del componente
          // (`text-base md:text-sm`), no hace falta repetirlo acá.
          className="h-11 md:h-8"
        />
      </div>
    </FormDialog>
  )
}
