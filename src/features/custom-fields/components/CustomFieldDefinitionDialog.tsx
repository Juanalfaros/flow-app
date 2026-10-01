import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, PlusSignIcon, ListSettingIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCreateCustomFieldMutation,
  useDeleteCustomFieldMutation,
  useUpdateCustomFieldMutation,
} from '@/features/custom-fields/mutations'
import {
  useProjectCustomFields,
  CUSTOM_FIELD_TYPE_LABEL as TYPE_LABEL,
  type CustomFieldType,
} from '@/features/custom-fields/queries'
import { TAG_PALETTE } from '@/features/labels/tag-colors'

interface CustomFieldDefinitionDialogProps {
  projectId: string
  // 'space': plantilla compartida de un espacio (NodeTreeItem.tsx, menú de
  // espacio) — `projectId` acá es el id del nodo espacio. Ninguna tarea
  // referencia esa fila directo (una tarea siempre vive dentro de un
  // proyecto, nunca de un espacio); se copia a cada proyecto nuevo que se
  // cree ahí adentro — ver 0073_space_level_fields.sql. Solo cambia el
  // título; crear/editar/borrar campos funciona idéntico en ambos modos.
  scope?: 'project' | 'space'
  // Controlado desde afuera cuando se abre como ítem de un DropdownMenu ya
  // existente (NodeTreeItem.tsx, MoreActionsMenu.tsx) en vez de tener su
  // propio botón trigger.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  // Ver el mismo comentario en StatusSettingsDialog.tsx — separado de
  // `scope` para que MoreActionsMenu.tsx pueda pedir "sin trigger propio"
  // con `scope='project'`.
  showTrigger?: boolean
}

// Gestión de campos personalizados de un proyecto — nueva, no una
// extensión del toggle de visibilidad fijo de FieldVisibilityToggles.tsx
// (ese sigue siendo la lista de 4 campos incorporados, algo aparte). Solo
// toma prestada la idea de "diálogo de administración" de
// LabelSettingsDialog.tsx.
export function CustomFieldDefinitionDialog({
  projectId,
  scope = 'project',
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  showTrigger = scope === 'project',
}: CustomFieldDefinitionDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = setControlledOpen ?? setUncontrolledOpen
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<CustomFieldType>('text')
  const [newOptions, setNewOptions] = useState('')
  const { data: fields } = useProjectCustomFields(projectId)
  const createMutation = useCreateCustomFieldMutation(projectId)
  const updateMutation = useUpdateCustomFieldMutation(projectId)
  const deleteMutation = useDeleteCustomFieldMutation(projectId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Sin trigger propio en modo espacio, o cuando el caller ya tiene el
          suyo (NodeTreeItem.tsx/MoreActionsMenu.tsx — open/onOpenChange
          controlados). */}
      {/* ListSettingIcon, no ListViewIcon: ese ya lo usa la tab "Lista"
          (ProjectViewTabs.tsx) Y el propio DensityToggle — tres cosas
          distintas con el mismo ícono en la misma pantalla, reportado por
          el usuario. */}
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <HugeiconsIcon icon={ListSettingIcon} />
            Campos personalizados
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{scope === 'space' ? 'Campos personalizados del espacio' : 'Campos personalizados de la lista'}</DialogTitle>
          {scope === 'space' && (
            <p className="text-xs text-text-muted">
              Plantilla compartida: toda lista nueva que se cree dentro de este espacio arranca con estos campos. No
              afecta a las listas que ya existen.
            </p>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {fields?.length === 0 && (
            <p className="text-sm text-text-muted">
              {scope === 'space' ? 'Todavía no hay campos personalizados en este espacio.' : 'Todavía no hay campos personalizados en esta lista.'}
            </p>
          )}
          {fields?.map((field) => (
            <div key={field.id} className="flex items-center gap-1.5 rounded-md bg-surface p-1.5">
              <Input
                defaultValue={field.name}
                aria-label="Nombre del campo"
                className="flex-1"
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== field.name) updateMutation.mutate({ fieldId: field.id, fields: { name } })
                }}
              />
              <span className="shrink-0 rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-muted">
                {TYPE_LABEL[field.field_type]}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => deleteMutation.mutate(field.id)}
                aria-label={`Eliminar campo "${field.name}"`}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </div>
          ))}
        </div>
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newName.trim()) return
            const options =
              newType === 'select'
                ? newOptions
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    // Ciclando la misma paleta de las etiquetas (tag-colors.ts)
                    // — a diferencia de LabelPicker (una etiqueta a la vez,
                    // siempre arranca en rojo y la persona la recolorea a
                    // mano), acá se crean varias opciones juntas: dejarlas
                    // todas del mismo color por default las volvía
                    // indistinguibles en la píldora (ver CustomFieldCell.tsx).
                    .map((label, i) => ({
                      id: crypto.randomUUID(),
                      label,
                      color: (TAG_PALETTE[i % TAG_PALETTE.length] ?? TAG_PALETTE[0]).hex,
                    }))
                : null
            if (newType === 'select' && (!options || options.length === 0)) {
              toast.error('Un campo de opción única necesita al menos una opción (separadas por coma).')
              return
            }
            createMutation.mutate(
              { name: newName.trim(), fieldType: newType, options },
              { onError: () => toast.error('No se pudo crear el campo.') },
            )
            setNewName('')
            setNewOptions('')
          }}
        >
          <div className="flex gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del campo (ej. Recinto)"
              className="flex-1"
            />
            <Select value={newType} onValueChange={(v) => setNewType(v as CustomFieldType)}>
              <SelectTrigger size="sm" className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(TYPE_LABEL) as [CustomFieldType, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {newType === 'select' && (
            <Input
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
              placeholder="Opciones separadas por coma (ej. Interior, Exterior, Mixto)"
            />
          )}
          <Button type="submit" variant="outline">
            <HugeiconsIcon icon={PlusSignIcon} />
            Agregar campo
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
