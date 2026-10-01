import { useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDuplicateSpaceMutation } from '@/features/nodes/mutations'

interface DuplicateSpaceDialogProps {
  workspaceId: string
  spaceId: string
  spaceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Mismo esqueleto que NewSpaceDialog — la única entrada que pide
// duplicate_space (0062_duplicate_space.sql) es el nombre del espacio
// nuevo, precargado como "<nombre> (copia)".
export function DuplicateSpaceDialog({ workspaceId, spaceId, spaceName, open, onOpenChange }: DuplicateSpaceDialogProps) {
  const [name, setName] = useState(`${spaceName} (copia)`)
  const mutation = useDuplicateSpaceMutation(workspaceId)
  const navigate = useNavigate()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(`${spaceName} (copia)`)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar espacio</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate(
              { spaceId, newName: name },
              {
                onError: () => toast.error('No se pudo duplicar el espacio.'),
                // `duplicate_space` (0062) devuelve el id del espacio
                // nuevo justamente para esto — antes se ignoraba y había
                // que buscarlo a mano en el árbol. `/f/$folderId` es el
                // destino genérico de espacio/carpeta ya usado en todo
                // el resto de la app (Sidebar.tsx, Breadcrumb.tsx,
                // NodeTreeItem.tsx), no específico de folders pese al
                // nombre de la ruta.
                onSuccess: (newSpaceId) => {
                  toast.success('Espacio duplicado.')
                  onOpenChange(false)
                  navigate({ to: '/f/$folderId', params: { folderId: newSpaceId } })
                },
              },
            )
          }}
        >
          <p className="text-xs text-text-muted">
            Copia las carpetas, listas, estados, campos personalizados y tareas de este espacio. Comentarios,
            adjuntos y tiempo registrado no se copian.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duplicate-space-name">Nombre</Label>
            <Input
              id="duplicate-space-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Duplicando…' : 'Duplicar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
