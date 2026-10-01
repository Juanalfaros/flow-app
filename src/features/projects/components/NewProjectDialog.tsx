import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { FormDialog } from '@/components/ui/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCreateProjectMutation } from '@/features/projects/mutations'
import { useNodeTree } from '@/features/nodes/queries'
import { buildTree, flattenParentOptions } from '@/features/nodes/build-tree'
import { useProjectTemplates } from '@/features/templates/queries'
import { useInstantiateProjectTemplateMutation } from '@/features/templates/mutations'
import { useNavigate } from '@tanstack/react-router'

interface NewProjectDialogProps {
  workspaceId: string
  /** 'icon': botón compacto "+" con tooltip, para chrome denso (sidebar).
   * 'none': sin trigger propio — el diálogo se controla 100% vía `open`/
   * `onOpenChange` (usado desde la fila del árbol al hacer clic en
   * "Nueva lista"). */
  trigger?: 'button' | 'icon' | 'none'
  /** Si se pasa, el proyecto se crea directamente bajo este nodo (space o
   * folder) y no se muestra el selector de padre. */
  defaultParentId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// FormDialog (no Dialog/DialogFooter): ver el comentario en
// NewSpaceDialog.tsx — pantalla completa en mobile con Cancelar/Crear en
// una cabecera fija, para que el teclado no tape el botón. En escritorio,
// idéntico a como se veía antes.
export function NewProjectDialog({
  workspaceId,
  trigger = 'button',
  defaultParentId,
  open: openProp,
  onOpenChange,
}: NewProjectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | undefined>(undefined)
  // F5 #8: '' = sin plantilla (crea con los 3 estados de siempre, como
  // hasta ahora). Cualquier otro valor es el id de un project_templates.
  const [templateId, setTemplateId] = useState<string>('')
  const { data: treeRows } = useNodeTree(workspaceId)
  const { data: templates } = useProjectTemplates(workspaceId)
  const mutation = useCreateProjectMutation(workspaceId)
  const instantiateMutation = useInstantiateProjectTemplateMutation()
  const navigate = useNavigate()

  const parentOptions = useMemo(() => {
    if (defaultParentId) return []
    const { roots } = buildTree(treeRows ?? [])
    return flattenParentOptions(roots)
  }, [treeRows, defaultParentId])

  const effectiveParentId = defaultParentId ?? parentId ?? parentOptions[0]?.id
  const isPending = mutation.isPending || instantiateMutation.isPending

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        trigger === 'icon' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Nueva lista">
                <HugeiconsIcon icon={PlusSignIcon} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Nueva lista</TooltipContent>
          </Tooltip>
        ) : trigger === 'button' ? (
          <Button>
            <HugeiconsIcon icon={PlusSignIcon} />
            Nueva lista
          </Button>
        ) : undefined
      }
      title="Nueva lista"
      submitLabel={isPending ? 'Creando…' : 'Crear'}
      submitDisabled={isPending || !effectiveParentId}
      onSubmit={(e) => {
        e.preventDefault()
        if (!effectiveParentId) return
        if (templateId) {
          instantiateMutation.mutate(
            { templateId, spaceId: effectiveParentId, name },
            {
              onError: () => toast.error('No se pudo crear la lista desde la plantilla.'),
              onSuccess: (projectId) => {
                setOpen(false)
                navigate({ to: '/p/$projectId/board', params: { projectId } })
              },
            },
          )
          return
        }
        mutation.mutate(
          { parentId: effectiveParentId, name },
          {
            onError: () => toast.error('No se pudo crear la lista.'),
            onSuccess: () => setOpen(false),
          },
        )
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-name">Nombre</Label>
        <Input
          id="project-name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lista nueva"
          className="h-11 md:h-8"
        />
      </div>
      {!defaultParentId && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-parent">Ubicación</Label>
          {/* `!`: la altura real vive en `data-[size=default]:h-8`
              (select.tsx), no en una clase `h-8` plana — un override sin
              `!` no le gana a esa variante (mismo criterio que
              TaskRow.tsx/NodeDetailContent.tsx al pisar `data-[size=sm]`). */}
          <Select value={effectiveParentId} onValueChange={setParentId}>
            <SelectTrigger id="project-parent" className="h-11! w-full md:h-8!">
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
      {templates && templates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-template">Plantilla (opcional)</Label>
          <Select value={templateId || '__none__'} onValueChange={(v) => setTemplateId(v === '__none__' ? '' : v)}>
            <SelectTrigger id="project-template" className="h-11! w-full md:h-8!">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin plantilla</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </FormDialog>
  )
}
