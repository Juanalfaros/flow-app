import { Link } from '@tanstack/react-router'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar'
import { useMoveTaskMutation, useUpdateTaskFieldsMutation } from '@/features/tasks/mutations'
import type { TaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'
import { between } from '@/lib/position'
import { PRIORITIES, PRIORITY_DOT, PRIORITY_LABEL } from '@/features/tasks/priority'
import { STATUS_KIND_DOT, isDoneStatus } from '@/features/projects/status-kind'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { useTaskViewMode } from '@/features/nodes/task-view-mode'
import { projectColor } from '@/features/nodes/project-color'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

const MAX_ASSIGNEE_AVATARS = 3

interface GlobalTableViewProps {
  tasks: TaskSummary[]
  statuses: StatusSummary[]
  projectsById: Map<string, { id: string; name: string }>
}

// Versión "todas las listas a la vez" de TableView.tsx (F5 #4) — mismo
// esqueleto (`<table>` semántico, celdas de Título/Estado/Prioridad/
// Asignados idénticas), con dos diferencias que vienen de cruzar
// proyectos distintos:
//   - Sin columnas de campos personalizados: un campo definido en un
//     proyecto no tiene identidad compartida en otro — mismo límite que
//     ya aceptan Calendario/Timeline globales.
//   - Columna "Lista" nueva (nombre + swatch de projectColor, mismo
//     tratamiento que CalendarTaskChip/GanttRow con showProjectColor) para
//     no perder de dónde es cada tarea al mezclarlas.
// Cada fila resuelve sus propios estados/mutaciones contra SU proyecto
// (task.container_id), no un projectId compartido — a diferencia de
// TableView, acá no hay uno solo.
export function GlobalTableView({ tasks, statuses, projectsById }: GlobalTableViewProps) {
  const setNode = useSetNodeSearchParam()
  const viewMode = useTaskViewMode()

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-10 text-center">
        <p className="text-sm text-text-muted">Sin tareas para mostrar.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border/60 shadow-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left font-mono text-[10px] font-medium tracking-wide text-text-muted uppercase">
            <th className="w-8 px-2 py-2" aria-hidden="true" />
            <th className="min-w-48 px-2 py-2">Tarea</th>
            <th className="px-2 py-2">Lista</th>
            <th className="px-2 py-2">Estado</th>
            <th className="px-2 py-2">Prioridad</th>
            <th className="px-2 py-2">Asignados</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const projectStatuses = statuses.filter((s) => s.project_id === task.container_id)
            const currentStatus = projectStatuses.find((s) => s.id === task.status_id)
            const isDone = isDoneStatus(currentStatus?.status_kind)

            return (
              <GlobalTableRow
                key={task.id}
                task={task}
                tasksInProject={tasks.filter((t) => t.container_id === task.container_id)}
                projectName={projectsById.get(task.container_id)?.name ?? '—'}
                projectStatuses={projectStatuses}
                isDone={isDone}
                onOpen={(e) => {
                  if (viewMode === 'side' || viewMode === 'modal') {
                    e.preventDefault()
                    setNode(task.id)
                  }
                }}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Fila propia (no inline en el .map de arriba): useMoveTaskMutation/
// useUpdateTaskFieldsMutation son hooks instanciados por container_id —
// cada fila puede ser de un proyecto distinto, así que cada una necesita
// su propia instancia, no una compartida por toda la tabla.
function GlobalTableRow({
  task,
  tasksInProject,
  projectName,
  projectStatuses,
  isDone,
  onOpen,
}: {
  task: TaskSummary
  /** Solo tareas del MISMO container_id que `task` — el resto de la tabla
   * puede tener tareas de otros proyectos, cuya posición no significa
   * nada acá (`useMoveTaskMutation` calcula el hueco dentro de un solo
   * proyecto, mismo criterio que TableView/list.tsx). */
  tasksInProject: TaskSummary[]
  projectName: string
  projectStatuses: StatusSummary[]
  isDone: boolean
  onOpen: (e: React.MouseEvent) => void
}) {
  const moveMutation = useMoveTaskMutation(task.container_id)
  const updateMutation = useUpdateTaskFieldsMutation(task.container_id, task.id)

  function moveToStatus(statusId: string) {
    const lastInColumn = tasksInProject
      .filter((t) => t.status_id === statusId && t.id !== task.id)
      .sort((a, b) => b.position - a.position)[0]
    const position = between(lastInColumn?.position, undefined)
    moveMutation.mutate({ taskId: task.id, statusId, position })
  }

  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-surface-alt">
      <td className="px-2 py-1.5">
        <Checkbox
          checked={isDone}
          aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
          onCheckedChange={() => {
            const doneStatus = projectStatuses.find((s) => s.status_kind === 'success')
            const defaultStatus = projectStatuses.find((s) => s.is_default) ?? projectStatuses[0]
            const target = isDone ? defaultStatus : doneStatus
            if (target) moveToStatus(target.id)
          }}
        />
      </td>
      <td className="max-w-64 px-2 py-1.5">
        <Link
          to="/p/$projectId/t/$taskId"
          params={{ projectId: task.container_id, taskId: task.id }}
          onClick={onOpen}
          className={cn('block truncate hover:underline', isDone && 'text-text-muted line-through')}
        >
          {task.title}
        </Link>
      </td>
      <td className="max-w-40 px-2 py-1.5">
        <span
          className="flex items-center gap-1.5 truncate border-l-[3px] pl-1.5 text-xs text-text-muted"
          style={{ borderLeftColor: projectColor(task.container_id) }}
        >
          {projectName}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <Select value={task.status_id ?? undefined} onValueChange={moveToStatus}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projectStatuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                <span className={cn('size-1.5 rounded-full', STATUS_KIND_DOT[status.status_kind])} />
                {status.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5">
        <Select value={task.priority} onValueChange={(priority) => updateMutation.mutate({ priority })}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[p])} />
                {PRIORITY_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5">
        {task.task_assignees.length > 0 ? (
          <AvatarGroup>
            {task.task_assignees.slice(0, MAX_ASSIGNEE_AVATARS).map((a) => (
              <Avatar key={a.user_id} size="sm">
                {a.assignee?.avatar_url && <AvatarImage src={a.assignee.avatar_url} alt="" />}
                <AvatarFallback>{initials(a.assignee?.full_name)}</AvatarFallback>
              </Avatar>
            ))}
            {task.task_assignees.length > MAX_ASSIGNEE_AVATARS && (
              <AvatarGroupCount>+{task.task_assignees.length - MAX_ASSIGNEE_AVATARS}</AvatarGroupCount>
            )}
          </AvatarGroup>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
    </tr>
  )
}
