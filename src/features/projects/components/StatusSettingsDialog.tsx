import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChevronDownIcon, ChevronUpIcon, Delete02Icon, Settings02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStatuses, type StatusSummary } from '@/features/projects/queries'
import {
  useCreateStatusMutation,
  useDeleteStatusMutation,
  useReorderStatusesMutation,
  useUpdateStatusMutation,
} from '@/features/projects/mutations'
import { useTasks } from '@/features/tasks/queries'
import { useBulkUpdateTasksMutation } from '@/features/tasks/mutations'
import { STATUS_KIND_DOT, STATUS_KIND_LABEL, STATUS_KINDS } from '@/features/projects/status-kind'
import { cn } from '@/lib/utils'

interface StatusSettingsDialogProps {
  projectId: string
  // 'space': plantilla compartida de un espacio (NodeTreeItem.tsx, menú de
  // espacio) — `projectId` en ese caso es el id del nodo espacio, no de un
  // proyecto. Ninguna tarea referencia esa fila directamente (las tareas
  // siempre viven dentro de un proyecto, nunca de un espacio — ver
  // 0073_space_level_fields.sql), así que `useTasks(projectId)` de abajo
  // siempre trae 0 filas ahí: el flujo de "reasignar antes de borrar" no
  // necesita ningún caso especial, simplemente nunca encuentra tareas que
  // reasignar. Solo cambia el título y se permite borrar hasta el último
  // estado (un espacio sin estados propios es válido: los proyectos nuevos
  // caen en el fallback fijo de 3 estados, ver create_project_with_defaults).
  scope?: 'project' | 'space'
  // Controlado desde afuera cuando se abre como ítem de un DropdownMenu ya
  // existente (NodeTreeItem.tsx, MoreActionsMenu.tsx) en vez de tener su
  // propio botón trigger.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  // Antes atado 1:1 a `scope === 'space'` (el único caso sin trigger
  // propio) — MoreActionsMenu.tsx necesita el mismo "sin trigger propio"
  // pero con `scope='project'`, así que se separa de scope (que sigue
  // siendo copy/comportamiento, no visibilidad del botón).
  showTrigger?: boolean
}

export function StatusSettingsDialog({
  projectId,
  scope = 'project',
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  showTrigger = scope === 'project',
}: StatusSettingsDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = setControlledOpen ?? setUncontrolledOpen
  const [newName, setNewName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<StatusSummary | null>(null)
  const [reassignTo, setReassignTo] = useState<string>('')
  const { data: statuses } = useStatuses(projectId)
  const { data: tasks } = useTasks(projectId)
  const createMutation = useCreateStatusMutation(projectId)
  const updateMutation = useUpdateStatusMutation(projectId)
  const deleteMutation = useDeleteStatusMutation(projectId)
  const reorderMutation = useReorderStatusesMutation(projectId)
  const bulkMutation = useBulkUpdateTasksMutation(projectId)

  const ordered = statuses ?? []
  const affectedTasks = pendingDelete ? (tasks ?? []).filter((t) => t.status_id === pendingDelete.id) : []
  const otherStatuses = pendingDelete ? ordered.filter((s) => s.id !== pendingDelete.id) : []

  function openDeleteConfirm(status: StatusSummary) {
    setPendingDelete(status)
    const candidates = ordered.filter((s) => s.id !== status.id)
    const fallback = candidates.find((s) => s.is_default) ?? candidates[0]
    setReassignTo(fallback?.id ?? '')
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const statusId = pendingDelete.id
    if (affectedTasks.length > 0 && reassignTo) {
      bulkMutation.mutate(
        { taskIds: affectedTasks.map((t) => t.id), fields: { status_id: reassignTo } },
        { onSuccess: () => deleteMutation.mutate(statusId) },
      )
    } else {
      deleteMutation.mutate(statusId)
    }
    setPendingDelete(null)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= ordered.length) return
    const ids = ordered.map((s) => s.id)
    const a = ids[index]
    const b = ids[target]
    // El swap por desestructuración (`[ids[i], ids[j]] = [ids[j], ids[i]]`)
    // asignaba `string | undefined` a un `string[]`: los límites ya estaban
    // comprobados arriba, pero el tipo no lo refleja. Extraer los dos valores
    // primero lo hace verificable sin cambiar el comportamiento.
    if (a === undefined || b === undefined) return
    ids[index] = b
    ids[target] = a
    reorderMutation.mutate(ids)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Sin trigger propio en modo espacio, o cuando el caller ya tiene el
          suyo (NodeTreeItem.tsx/MoreActionsMenu.tsx — open/onOpenChange
          controlados). */}
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <HugeiconsIcon icon={Settings02Icon} />
            Estados
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{scope === 'space' ? 'Estados de tarea del espacio' : 'Estados de la lista'}</DialogTitle>
          {scope === 'space' && (
            <p className="text-xs text-text-muted">
              Plantilla compartida: toda lista nueva que se cree dentro de este espacio arranca con estos estados.
              No afecta a las listas que ya existen.
            </p>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {ordered.map((status, index) => (
            <div key={status.id} className="flex items-center gap-1.5 rounded-md bg-surface p-1.5">
              {/* icon-sm (28px), no icon-xs (24px), y con gap entre los dos
                  — auditoría mobile: apretados sin espacio entre sí y por
                  debajo del tamaño de toque razonable, fácil de tocar el
                  equivocado en una fila angosta. */}
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Mover "${status.name}" hacia arriba`}
                >
                  <HugeiconsIcon icon={ChevronUpIcon} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === ordered.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Mover "${status.name}" hacia abajo`}
                >
                  <HugeiconsIcon icon={ChevronDownIcon} />
                </Button>
              </div>
              <Input
                defaultValue={status.name}
                aria-label="Nombre del estado"
                className="flex-1"
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== status.name) {
                    updateMutation.mutate({ statusId: status.id, fields: { name } })
                  }
                }}
              />
              <Select
                value={status.status_kind}
                onValueChange={(status_kind) =>
                  updateMutation.mutate({ statusId: status.id, fields: { status_kind } })
                }
              >
                <SelectTrigger size="sm">
                  {/* Sin dot manual acá: Radix ya refleja el children del
                      SelectItem seleccionado dentro de SelectValue — un
                      dot puesto acá además del que trae cada SelectItem
                      quedaba duplicado. */}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      <span className={cn('size-1.5 rounded-full', STATUS_KIND_DOT[kind])} />
                      {STATUS_KIND_LABEL[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon-sm"
                // En modo espacio no hace falta dejar al menos 1: una
                // plantilla vacía es válida, un proyecto nuevo simplemente
                // cae en el fallback fijo (ver create_project_with_defaults).
                disabled={scope === 'project' && ordered.length <= 1}
                onClick={() => openDeleteConfirm(status)}
                aria-label={`Eliminar estado "${status.name}"`}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </div>
          ))}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newName.trim()) return
            createMutation.mutate(
              { name: newName.trim(), statusKind: 'neutral' },
              { onError: () => toast.error('No se pudo crear el estado.') },
            )
            setNewName('')
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nuevo estado"
            className="flex-1"
          />
          <Button type="submit" variant="outline">
            <HugeiconsIcon icon={PlusSignIcon} />
            Agregar
          </Button>
        </form>
      </DialogContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el estado "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3 text-left">
                {affectedTasks.length > 0 ? (
                  <>
                    <span>
                      {affectedTasks.length} tarea{affectedTasks.length === 1 ? '' : 's'} tiene
                      {affectedTasks.length === 1 ? '' : 'n'} este estado. Elige a dónde se mueven:
                    </span>
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue placeholder="Elegir estado destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherStatuses.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className={cn('size-1.5 rounded-full', STATUS_KIND_DOT[s.status_kind])} />
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <span>Esta acción no se puede deshacer.</span>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={affectedTasks.length > 0 && !reassignTo}
              onClick={confirmDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
