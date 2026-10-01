import { useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BookmarkAdd01Icon,
  Delete02Icon,
  FlashIcon,
  MoreHorizontalIcon,
  Archive01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useProjects, useStatuses } from '@/features/projects/queries'
import { useTasks } from '@/features/tasks/queries'
import {
  useDeleteProjectMutation,
  useDeleteProjectWithTasksMutation,
  useMoveProjectTasksMutation,
  useUpdateProjectMutation,
} from '@/features/projects/mutations'
import { SaveAsTemplateDialog } from '@/features/templates/components/SaveAsTemplateDialog'
import { useSaveProjectAsTemplateMutation } from '@/features/templates/mutations'
import { AutomationRulesDialog } from '@/features/automations/components/AutomationRulesDialog'
import { useArchiveNodeMutation } from '@/features/nodes/mutations'

const DELETE_ALL = '__delete_all__'

export function DeleteProjectDialog({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string>(DELETE_ALL)
  // F-06: mismo criterio que un espacio (NodeTreeItem.tsx) — cuando la
  // lista tiene tareas Y se eligió "eliminar todo" (se pierden de verdad,
  // no como "mover a otra lista"), hay que escribir el nombre exacto antes
  // de poder confirmar.
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const { workspaceId } = useCurrentWorkspace()
  const { data: allProjects } = useProjects(workspaceId)
  const { data: tasks } = useTasks(projectId)
  const { data: targetStatuses } = useStatuses(target !== DELETE_ALL ? target : '')
  const moveMutation = useMoveProjectTasksMutation()
  const deleteMutation = useDeleteProjectMutation(workspaceId)
  const deleteWithTasksMutation = useDeleteProjectWithTasksMutation(workspaceId)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const saveAsTemplateMutation = useSaveProjectAsTemplateMutation(workspaceId)
  const [automationsOpen, setAutomationsOpen] = useState(false)
  // "Archivar" vivía solo en el menú de un espacio — el backend
  // (archive_node, 0061/0067) siempre fue genérico por nodeId, sin
  // restricción de tipo. Reportado por el usuario ("¿por qué no
  // carpetas y listas?").
  const archiveMutation = useArchiveNodeMutation(workspaceId)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(projectName)
  const renameMutation = useUpdateProjectMutation(workspaceId, projectId)

  const otherProjects = (allProjects ?? []).filter((p) => p.id !== projectId)
  const taskCount = tasks?.length ?? 0
  const isPending = moveMutation.isPending || deleteMutation.isPending || deleteWithTasksMutation.isPending
  const requiresTypedConfirm = taskCount > 0 && target === DELETE_ALL

  function openConfirm() {
    // por default, mover a otro proyecto si hay uno — la opción segura
    // queda pre-seleccionada, "eliminar todo" hay que elegirlo a propósito.
    setTarget(otherProjects[0]?.id ?? DELETE_ALL)
    setDeleteConfirmText('')
    setOpen(true)
  }

  // Todo con mutateAsync + try/catch (antes: el paso "mover" sí se
  // esperaba, pero si tiraba, la función cortaba ahí sin avisar nada —
  // ni toast, ni el diálogo se cerraba, un estado ambiguo sin manera de
  // saber si la lista se eliminó o no). Ahora el diálogo solo se cierra
  // si TODOS los pasos terminan bien, y cualquier falla (mover, o
  // cualquiera de los dos caminos de borrado) deja el diálogo abierto
  // con un aviso, para reintentar en vez de adivinar qué pasó.
  async function handleConfirm() {
    try {
      if (taskCount > 0 && target !== DELETE_ALL) {
        const defaultStatus = targetStatuses?.find((s) => s.is_default) ?? targetStatuses?.[0]
        if (!defaultStatus) return
        await moveMutation.mutateAsync({ fromProjectId: projectId, toProjectId: target, toStatusId: defaultStatus.id })
        await deleteMutation.mutateAsync(projectId)
      } else if (taskCount > 0 && target === DELETE_ALL) {
        // El DELETE directo de un proyecto ya no cascadea sus tareas (ver
        // PLAN.md §4.2) — con tareas presentes, "eliminar todo" tiene que
        // pasar por la RPC dedicada o quedarían huérfanas.
        await deleteWithTasksMutation.mutateAsync(projectId)
      } else {
        await deleteMutation.mutateAsync(projectId)
      }
      setOpen(false)
    } catch {
      toast.error('No se pudo eliminar la lista. Intenta de nuevo.')
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Más opciones de la lista">
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {/* Renombrar solo existía como input inline sobre el título
              (EditableProjectName) — el único punto de renombrado de toda
              la app. Al colapsar la cabecera de proyecto en mobile ese
              input quedó en escritorio, y no había forma de renombrar una
              lista desde el teléfono. Acá además tapa un hueco viejo: en
              escritorio tampoco había nada que anunciara que el título era
              editable, había que adivinarlo. */}
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <HugeiconsIcon icon={PencilEdit02Icon} />
            Renombrar
          </DropdownMenuItem>
          {/* F5 #8: snapshotea estados + campos personalizados + tareas
              top-level (cada una vía save_task_as_template) en
              project_templates (0056_templates.sql) — desacoplado de esta
              lista, no un duplicado inmediato. */}
          <DropdownMenuItem onSelect={() => setTemplateDialogOpen(true)}>
            <HugeiconsIcon icon={BookmarkAdd01Icon} />
            Guardar como plantilla
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAutomationsOpen(true)}>
            <HugeiconsIcon icon={FlashIcon} />
            Automatizaciones
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              archiveMutation.mutate(projectId, {
                onError: () => toast.error('No se pudo archivar la lista.'),
              })
            }
          >
            <HugeiconsIcon icon={Archive01Icon} />
            Archivar
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={openConfirm}>
            <HugeiconsIcon icon={Delete02Icon} />
            Eliminar lista
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* `onOpenChange` resetea el valor al abrir, no al cerrar: si la
          lista se renombró desde otro lado (o se canceló con un texto a
          medias), el input tiene que arrancar de lo que dice el nombre
          AHORA, no de lo último que se tecleó. */}
      <AlertDialog
        open={renameOpen}
        onOpenChange={(next) => {
          if (next) setRenameValue(projectName)
          setRenameOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renombrar lista</AlertDialogTitle>
          </AlertDialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const clean = renameValue.trim()
              if (!clean || clean === projectName) {
                setRenameOpen(false)
                return
              }
              renameMutation.mutate(clean, {
                onError: () => toast.error('No se pudo renombrar la lista.'),
              })
              setRenameOpen(false)
            }}
          >
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              aria-label="Nombre de la lista"
              // h-11 + text-base: objetivo táctil, y por debajo de 16px iOS
              // hace zoom solo al enfocar un input.
              className="h-11 text-base"
            />
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
              <Button type="submit" disabled={!renameValue.trim()}>
                Guardar
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <SaveAsTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        defaultName={projectName}
        isPending={saveAsTemplateMutation.isPending}
        onSave={(name) =>
          saveAsTemplateMutation.mutate(
            { projectId, name },
            {
              onSuccess: () => {
                toast.success('Plantilla guardada.')
                setTemplateDialogOpen(false)
              },
              onError: () => toast.error('No se pudo guardar la plantilla.'),
            },
          )
        }
      />

      {automationsOpen && (
        // Montado solo cuando está abierto: sus queries (reglas del
        // proyecto, miembros, estados, etiquetas) no deben dispararse en
        // cada fila de proyecto — mismo criterio que NodeAccessDialog.
        <AutomationRulesDialog
          projectId={projectId}
          workspaceId={workspaceId}
          open={automationsOpen}
          onOpenChange={setAutomationsOpen}
        />
      )}

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setDeleteConfirmText('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{projectName}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3 text-left">
                {taskCount > 0 ? (
                  <>
                    <span>
                      Tiene {taskCount} tarea{taskCount === 1 ? '' : 's'} (con sus subtareas y comentarios).
                      ¿Qué hacemos con ellas?
                    </span>
                    <Select
                      value={target}
                      onValueChange={(next) => {
                        setTarget(next)
                        setDeleteConfirmText('')
                      }}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {otherProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            Mover a "{p.name}"
                          </SelectItem>
                        ))}
                        <SelectItem value={DELETE_ALL}>Eliminar todo (tareas incluidas)</SelectItem>
                      </SelectContent>
                    </Select>
                    {target === DELETE_ALL && (
                      <>
                        <span className="text-danger">Esta acción no se puede deshacer.</span>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="delete-project-confirm" className="text-xs text-text-muted">
                            Escribe <span className="font-medium text-text">{projectName}</span> para confirmar.
                          </Label>
                          <Input
                            id="delete-project-confirm"
                            autoComplete="off"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                          />
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <span>
                    Esta acción no se puede deshacer. También se eliminan sus estados.
                  </span>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending || (requiresTypedConfirm && deleteConfirmText !== projectName)}
              onClick={handleConfirm}
            >
              {taskCount > 0 && target !== DELETE_ALL ? 'Mover tareas y eliminar' : 'Eliminar todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
