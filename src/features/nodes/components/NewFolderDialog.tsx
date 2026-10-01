import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateFolderMutation } from '@/features/nodes/mutations'
import { useNodeTree } from '@/features/nodes/queries'
import { buildTree, flattenParentOptions } from '@/features/nodes/build-tree'

interface NewFolderDialogProps {
  workspaceId: string
  /** Carpeta o space bajo el que se crea. Si se omite (F-01: el "+" a
   * nivel de "Espacios", sin fila de árbol de la que partir), se muestra
   * un selector — mismo patrón que NewProjectDialog sin `defaultParentId`. */
  parentId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// FormDialog (no Dialog/DialogFooter): ver el comentario en
// NewSpaceDialog.tsx — pantalla completa en mobile con Cancelar/Crear en
// una cabecera fija, para que el teclado no tape el botón. En escritorio,
// idéntico a como se veía antes.
export function NewFolderDialog({ workspaceId, parentId: defaultParentId, open, onOpenChange }: NewFolderDialogProps) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | undefined>(undefined)
  const { data: treeRows } = useNodeTree(workspaceId)
  const mutation = useCreateFolderMutation(workspaceId)

  const parentOptions = useMemo(() => {
    if (defaultParentId) return []
    const { roots } = buildTree(treeRows ?? [])
    return flattenParentOptions(roots)
  }, [treeRows, defaultParentId])

  const effectiveParentId = defaultParentId ?? parentId ?? parentOptions[0]?.id

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nueva carpeta"
      submitLabel={mutation.isPending ? 'Creando…' : 'Crear'}
      submitDisabled={mutation.isPending || !effectiveParentId}
      onSubmit={(e) => {
        e.preventDefault()
        if (!effectiveParentId) return
        mutation.mutate(
          { parentId: effectiveParentId, title: name },
          {
            onError: () => toast.error('No se pudo crear la carpeta.'),
            onSuccess: () => {
              setName('')
              onOpenChange(false)
            },
          },
        )
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="folder-name">Nombre</Label>
        <Input
          id="folder-name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Carpeta nueva"
          className="h-11 md:h-8"
        />
      </div>
      {!defaultParentId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="folder-parent">Ubicación</Label>
          <Select value={effectiveParentId} onValueChange={setParentId}>
            {/* `!`: la altura real vive en `data-[size=default]:h-8`
                (select.tsx), no en una clase `h-8` plana — un override sin
                `!` no le gana a esa variante (mismo criterio que
                TaskRow.tsx/NodeDetailContent.tsx al pisar `data-[size=sm]`). */}
            <SelectTrigger id="folder-parent" className="h-11! w-full md:h-8!">
              <SelectValue placeholder="Elegir espacio o carpeta" />
            </SelectTrigger>
            <SelectContent>
              {parentOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </FormDialog>
  )
}
