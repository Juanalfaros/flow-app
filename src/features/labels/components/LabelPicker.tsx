import { useRef, useState } from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  PlusSignIcon,
  TagsIcon,
  Cancel01Icon,
  Settings02Icon,
  ArrowLeft01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandList, CommandGroup, CommandItem } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLabels, type LabelSummary } from '@/features/labels/queries'
import {
  useCreateLabelMutation,
  useUpdateLabelMutation,
  useDeleteLabelMutation,
  useToggleTaskLabelMutation,
} from '@/features/labels/mutations'
import { TAG_PALETTE } from '@/features/labels/tag-colors'
import type { TaskLabelSummary } from '@/features/tasks/queries'
import { cn } from '@/lib/utils'

interface LabelPickerProps {
  workspaceId: string
  /**
   * Con `task`: asignar/desasignar etiquetas de ESA tarea puntual — uso
   * normal, en detalle/tablero/lista. Sin `task`: administrar las
   * etiquetas del workspace sin ninguna tarea de por medio (el botón
   * "Etiquetas" de la barra de herramientas del proyecto, antes
   * LabelSettingsDialog, retirado — esto cubre lo mismo y más). Sin
   * tarea no hay fila de pills asignadas ni nada que "asignar": clic en
   * una etiqueta abre directo su editor.
   */
  task?: { projectId: string; taskId: string; assignedLabels: TaskLabelSummary[] }
  /** Trigger circular "+" en vez del botón ícono+texto "Etiquetas" — usado
   *  en la fila "Etiquetas" del detalle de tarea, donde la etiqueta de la
   *  fila ya dice "Etiquetas". Sin uso real hoy con `task` ausente (el
   *  botón de la barra de herramientas siempre quiere texto). */
  compact?: boolean
  /** Controlado desde afuera cuando se abre como ítem de un menú ya
   * existente (MoreActionsMenu.tsx) en vez de tener su propio trigger. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** false: sin `<PopoverTrigger>` propio — el caller decide cuándo abrir
   * vía `open`/`onOpenChange`. Default true (comportamiento de siempre). */
  showTrigger?: boolean
}

/**
 * Buscar + asignar + CREAR + editar (color/nombre) + eliminar, todo en un
 * solo Popover — mismo espíritu que el selector de etiquetas de ClickUp
 * (pedido explícito del usuario, con capturas de referencia). Antes eran
 * dos UI separadas: esta (solo tildar existentes) y LabelSettingsDialog
 * (un diálogo aparte para crear/editar/borrar) — confuso tener que saber
 * cuál usar para qué. Ahora es una sola.
 */
export function LabelPicker({
  workspaceId,
  task,
  compact = false,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  showTrigger = true,
}: LabelPickerProps) {
  const { data: labels } = useLabels(workspaceId)
  const toggleMutation = useToggleTaskLabelMutation(task?.projectId ?? '')
  const createMutation = useCreateLabelMutation(workspaceId)
  const updateMutation = useUpdateLabelMutation(workspaceId)
  const deleteMutation = useDeleteLabelMutation(workspaceId)

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = setControlledOpen ?? setUncontrolledOpen
  const [query, setQuery] = useState('')
  // Sin `task`, cada clic en una etiqueta YA significa "editarla" (no hay
  // ningún "asignar" posible) — el modo solo existe cuando sí hay tarea,
  // para poder elegir entre tildar y editar con el mismo clic.
  const [manageMode, setManageMode] = useState(false)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)

  function reset() {
    setQuery('')
    setManageMode(false)
    setEditingLabelId(null)
  }

  const assignedIds = new Set(task?.assignedLabels.map((l) => l.id) ?? [])
  const unassigned = (labels ?? []).filter((l) => !assignedIds.has(l.id))
  const normalizedQuery = query.trim().toLowerCase()
  const filteredUnassigned = normalizedQuery
    ? unassigned.filter((l) => l.name.toLowerCase().includes(normalizedQuery))
    : unassigned
  const hasExactMatch = (labels ?? []).some((l) => l.name.toLowerCase() === normalizedQuery)
  const editingLabel = editingLabelId ? (labels ?? []).find((l) => l.id === editingLabelId) ?? null : null
  const isCustomColor =
    !!editingLabel?.color && !TAG_PALETTE.some((c) => c.hex.toLowerCase() === editingLabel.color?.toLowerCase())
  const colorInputRef = useRef<HTMLInputElement>(null)

  function handleSelectExisting(label: LabelSummary) {
    if (!task || manageMode) {
      setEditingLabelId(label.id)
      return
    }
    toggleMutation.mutate({ taskId: task.taskId, label, assigned: false })
  }

  function handleCreate(name: string) {
    createMutation.mutate(
      { name, color: TAG_PALETTE[0].hex },
      {
        onSuccess: (created) => {
          if (task) toggleMutation.mutate({ taskId: task.taskId, label: created, assigned: false })
        },
        onError: () => toast.error('No se pudo crear la etiqueta.'),
      },
    )
    setQuery('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      {showTrigger && (
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            aria-label="Agregar etiqueta"
            title="Agregar etiqueta"
            // `after:` agranda el área de toque de 24px a 40px sin
            // agrandar el círculo visible — mismo criterio que Checkbox
            // (ui/checkbox.tsx). Auditoría mobile.
            className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-text-muted after:absolute after:-inset-2 hover:border-accent hover:text-accent"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
          </button>
        ) : (
          // TagsIcon (plural), no Tag01Icon: ese lo usa el filtro por
          // etiqueta de FilterBar.tsx, un botón sin texto en la misma
          // barra — con los dos mostrando el mismo tag no se distinguía
          // "administrar etiquetas" de "filtrar por etiqueta".
          <Button variant="outline" size="sm">
            <HugeiconsIcon icon={TagsIcon} />
            Etiquetas
          </Button>
        )}
      </PopoverTrigger>
      )}
      <PopoverContent className="w-64 p-0">
        {editingLabel ? (
          <div className="p-2">
            <div className="mb-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditingLabelId(null)}
                aria-label="Volver"
                className="flex size-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-alt hover:text-text"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              </button>
              <Input
                defaultValue={editingLabel.name}
                aria-label="Nombre de la etiqueta"
                className="h-7 flex-1 text-xs"
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== editingLabel.name) {
                    updateMutation.mutate({ labelId: editingLabel.id, fields: { name } })
                  }
                }}
              />
            </div>
            <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
              {/* "Sin color": la captura de referencia del usuario trae
                  esta opción (tachado diagonal) antes que la paleta fija
                  — acá también null es un valor real (la columna
                  `labels.color` es nullable), no solo "todavía sin
                  elegir". */}
              <button
                type="button"
                aria-label="Sin color"
                title="Sin color"
                onClick={() => updateMutation.mutate({ labelId: editingLabel.id, fields: { color: null } })}
                className={cn(
                  'relative size-5 shrink-0 overflow-hidden rounded-full border border-border-strong bg-surface-alt transition-transform hover:scale-110',
                  !editingLabel.color && 'ring-2 ring-offset-1 ring-text',
                )}
              >
                <span className="absolute top-1/2 left-[-2px] h-px w-[26px] -translate-y-1/2 rotate-45 bg-danger" />
              </button>
              {TAG_PALETTE.map(({ name: colorName, hex }) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={`Color ${colorName}`}
                  title={colorName}
                  onClick={() => updateMutation.mutate({ labelId: editingLabel.id, fields: { color: hex } })}
                  className={cn(
                    'size-5 shrink-0 rounded-full border border-border transition-transform hover:scale-110',
                    editingLabel.color?.toLowerCase() === hex.toLowerCase() && 'ring-2 ring-offset-1 ring-text',
                  )}
                  style={{ backgroundColor: hex }}
                />
              ))}
              {/* El color actual, cuando es uno elegido con el selector
                  libre de abajo (no está en TAG_PALETTE) — sin esto, un
                  color "Añadir color" quedaba sin ningún swatch marcado
                  como "el elegido". */}
              {isCustomColor && (
                <button
                  type="button"
                  aria-label="Color actual"
                  title="Color actual"
                  onClick={() => colorInputRef.current?.click()}
                  className="size-5 shrink-0 rounded-full border border-border ring-2 ring-offset-1 ring-text transition-transform hover:scale-110"
                  style={{ backgroundColor: editingLabel.color ?? undefined }}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => colorInputRef.current?.click()}
              className="mb-2 flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs text-text-secondary hover:bg-surface-alt hover:text-text"
            >
              <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
              Añadir color
            </button>
            {/* Nativo, no un color-picker propio: cubre cualquier hex sin
                construir un componente nuevo, y cada navegador ya trae el
                suyo (accesible, con teclado, todo gratis). Solo el botón
                de arriba es visible; esto dispara su UI nativa al hacer
                click en él. */}
            <input
              ref={colorInputRef}
              type="color"
              aria-label="Elegir color personalizado"
              value={editingLabel.color ?? '#94A3B8'}
              onChange={(e) => updateMutation.mutate({ labelId: editingLabel.id, fields: { color: e.target.value } })}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => {
                deleteMutation.mutate(editingLabel.id)
                setEditingLabelId(null)
              }}
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-xs text-danger hover:bg-danger-bg"
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              Eliminar etiqueta
            </button>
          </div>
        ) : (
          <Command shouldFilter={false}>
            <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
              {task?.assignedLabels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() =>
                    manageMode
                      ? setEditingLabelId(label.id)
                      : toggleMutation.mutate({ taskId: task.taskId, label, assigned: true })
                  }
                  className="inline-flex max-w-[9rem] items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: label.color ?? undefined }}
                >
                  <span className="truncate">{label.name}</span>
                  <HugeiconsIcon icon={manageMode ? Settings02Icon : Cancel01Icon} className="size-3 shrink-0" />
                </button>
              ))}
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder={task?.assignedLabels.length ? '' : 'Buscar o crear…'}
                className="min-w-16 flex-1 bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-text-muted"
              />
            </div>

            <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
              <span className="text-[11px] font-medium text-text-muted">
                {task ? 'Selecciona una opción' : 'Etiquetas del workspace'}
              </span>
              {task && (
                <button
                  type="button"
                  onClick={() => setManageMode((v) => !v)}
                  aria-label="Editar etiquetas"
                  title="Editar etiquetas"
                  className={cn(
                    'flex size-5 items-center justify-center rounded text-text-muted hover:bg-surface-alt hover:text-text',
                    manageMode && 'bg-accent-soft text-accent-text-on-bg hover:bg-accent-soft',
                  )}
                >
                  <HugeiconsIcon icon={Settings02Icon} className="size-3.5" />
                </button>
              )}
            </div>

            <CommandList className="max-h-52 px-1 pb-1">
              <CommandGroup>
                {filteredUnassigned.map((label) => (
                  <CommandItem key={label.id} value={label.name} onSelect={() => handleSelectExisting(label)}>
                    <span
                      className="max-w-[11rem] truncate rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: label.color ?? undefined }}
                    >
                      {label.name}
                    </span>
                  </CommandItem>
                ))}
                {query.trim() && !hasExactMatch && (
                  <CommandItem value={`__create__${query}`} onSelect={() => handleCreate(query.trim())}>
                    <span className="text-text-muted">Crear</span>
                    <b className="truncate text-text">{query.trim()}</b>
                  </CommandItem>
                )}
                {filteredUnassigned.length === 0 && !query.trim() && (
                  <p className="p-2 text-xs text-text-muted">
                    {task ? 'Sin más etiquetas.' : 'Sin etiquetas en el workspace.'}
                  </p>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
