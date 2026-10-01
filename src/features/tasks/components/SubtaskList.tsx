import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useSubtasks, type TaskAssigneeSummary } from '@/features/tasks/queries'
import {
  DELETE_UNDO_DELAY_MS,
  useCreateSubtaskMutation,
  useDeleteSubtaskMutation,
  useSetSubtaskAssigneeMutation,
  useUpdateSubtaskStatusMutation,
} from '@/features/tasks/mutations'
import { SubtaskAssigneePicker } from '@/features/assignees/components/SubtaskAssigneePicker'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import type { StatusSummary } from '@/features/projects/queries'
import { isDoneStatus } from '@/features/projects/status-kind'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

interface SubtaskListProps {
  projectId: string
  parentTaskId: string
  statuses: StatusSummary[]
  // Pool para el "asignar rápido": lo común es repartir las subtareas entre
  // los mismos asignados de la tarea padre, no traer a alguien nuevo del
  // workspace. Elegir a una persona acá reemplaza al responsable actual de
  // esa subtarea puntual — una subtarea tiene UN solo responsable, no un
  // pool (a diferencia de la tarea padre, que sí admite varios asignados).
  parentAssignees: TaskAssigneeSummary[]
}

export function SubtaskList({ projectId, parentTaskId, statuses, parentAssignees }: SubtaskListProps) {
  // `isError` sí se lee (antes solo `data`): un error acá quedaba
  // completamente silencioso — la sección se veía igual que "sin
  // subtareas todavía", sin ningún indicio de que la consulta había
  // fallado. Fue justo lo que pasó con el bug real de la relación
  // ambigua nodes/statuses (ver subtasksQueryOptions en queries.ts):
  // nunca hubo un error visible que apuntara ahí.
  const { data: subtasks, isError } = useSubtasks(parentTaskId)
  const toggleMutation = useUpdateSubtaskStatusMutation(parentTaskId)
  const createMutation = useCreateSubtaskMutation(projectId, parentTaskId)
  const deleteMutation = useDeleteSubtaskMutation(parentTaskId)
  const assignMutation = useSetSubtaskAssigneeMutation(parentTaskId)
  const { workspaceId } = useCurrentWorkspace()
  const [title, setTitle] = useState('')

  const doneStatus = statuses.find((s) => s.status_kind === 'success')
  const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0]

  function toggle(taskId: string, isDone: boolean) {
    const target = isDone ? defaultStatus : doneStatus
    if (!target) return
    toggleMutation.mutate({
      taskId,
      status: { id: target.id, name: target.name, status_kind: target.status_kind },
    })
  }

  // Mismo "Deshacer" que ya usa borrar una tarea de proyecto
  // (NodeDetailContent.tsx, handleDeleteTask) — mismo margen de
  // DELETE_UNDO_DELAY_MS antes de que el borrado real salga al servidor.
  function handleDelete(taskId: string, taskTitle: string) {
    const undoState = { cancelled: false }
    deleteMutation.mutate({ taskId, undoState })
    toast(`Se eliminó "${taskTitle}".`, {
      duration: DELETE_UNDO_DELAY_MS,
      action: {
        label: 'Deshacer',
        onClick: () => {
          undoState.cancelled = true
        },
      },
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {isError && (
        <p className="text-xs text-danger">No se pudieron cargar las subtareas. Vuelve a intentarlo.</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {subtasks?.map((subtask) => {
          const isDone = isDoneStatus(subtask.status?.status_kind)
          return (
            <li key={subtask.id} className="flex items-center gap-2">
              <Checkbox
                checked={isDone}
                onCheckedChange={() => toggle(subtask.id, isDone)}
                aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
              />
              <Link
                to="/p/$projectId/t/$taskId"
                params={{ projectId, taskId: subtask.id }}
                className="flex-1 truncate text-sm hover:underline"
              >
                {subtask.title}
              </Link>
              {/* Asignar rápido: un clic sobre el avatar de un asignado del
                  padre lo pone como responsable de esta subtarea puntual
                  (reemplazando al anterior, si había uno) — clic de nuevo
                  sobre quien ya es responsable lo desasigna. */}
              <div className="flex shrink-0 items-center gap-0.5">
                {parentAssignees.map((a) => {
                  const isResponsible = subtask.assignee_id === a.user_id
                  return (
                    <button
                      key={a.user_id}
                      type="button"
                      title={`${isResponsible ? 'Quitar de' : 'Asignar a'} ${a.assignee?.full_name ?? a.user_id}`}
                      onClick={() =>
                        assignMutation.mutate({
                          taskId: subtask.id,
                          assigneeId: isResponsible ? null : a.user_id,
                          assigneeProfile: isResponsible ? null : a.assignee,
                        })
                      }
                      className={cn('rounded-full transition-opacity', !isResponsible && 'opacity-30 hover:opacity-70')}
                    >
                      <Avatar size="sm">
                        {a.assignee?.avatar_url && <AvatarImage src={a.assignee.avatar_url} alt="" />}
                        <AvatarFallback>{initials(a.assignee?.full_name)}</AvatarFallback>
                      </Avatar>
                    </button>
                  )
                })}
                {workspaceId && (
                  <SubtaskAssigneePicker
                    workspaceId={workspaceId}
                    parentTaskId={parentTaskId}
                    taskId={subtask.id}
                    assigneeId={subtask.assignee_id}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Eliminar subtarea "${subtask.title}"`}
                  onClick={() => handleDelete(subtask.id, subtask.title)}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim() || !defaultStatus) return
          createMutation.mutate(
            { title: title.trim(), statusId: defaultStatus.id },
            {
              onError: () =>
                toast.error('No se puede anidar más de un nivel de subtareas.'),
            },
          )
          setTitle('')
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Agregar subtarea"
          className="h-7 flex-1 text-xs"
        />
        <Button type="submit" variant="ghost" size="sm">
          <HugeiconsIcon icon={PlusSignIcon} />
          Agregar
        </Button>
      </form>
    </div>
  )
}
