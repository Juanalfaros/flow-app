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
import {
  useProjectCustomFields,
  useProjectTaskCustomFieldValues,
  type CustomFieldDefinition,
} from '@/features/custom-fields/queries'
import { useUpsertCustomFieldValueMutation } from '@/features/custom-fields/mutations'
import { CustomFieldCell } from '@/features/custom-fields/components/CustomFieldCell'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'
import type { Json } from '@/features/nodes/types'

const MAX_ASSIGNEE_AVATARS = 3

interface TableViewProps {
  projectId: string
  tasks: TaskSummary[]
  statuses: StatusSummary[]
  selectedIds: Set<string>
}

// F5 #4 — el modelo de datos ya existía (project_custom_fields +
// task_custom_field_values, 0048/0049); esto es la grilla que faltaba.
// `<table>` semántico y no un div-grid con `grid-cols-[...]` (a
// diferencia de list.tsx/TaskRow.tsx): el número de columnas acá es
// DINÁMICO (una por cada campo personalizado del proyecto), y el layout
// nativo de tabla reparte el ancho de columna solo — no hace falta
// calcular un `grid-template-columns` a mano por cada combinación posible
// de campos. Sin librería nueva (@tanstack/react-table no está en
// package.json y esto no la necesita): Título/Estado/Prioridad/
// Asignados reusan exactamente los mismos patrones de TaskRow.tsx
// (Link, Select+moveToStatus, avatar stack de solo lectura), las columnas
// de campos personalizados reusan CustomFieldCell.tsx (el mismo control
// que ya usa el panel de detalle).
export function TableView({ projectId, tasks, statuses, selectedIds }: TableViewProps) {
  const setNode = useSetNodeSearchParam()
  const viewMode = useTaskViewMode()
  const moveMutation = useMoveTaskMutation(projectId)
  const { data: fields } = useProjectCustomFields(projectId)

  const taskIds = tasks.map((t) => t.id)
  const { data: values } = useProjectTaskCustomFieldValues(projectId, taskIds)
  const valuesByTask = new Map<string, Map<string, Json>>()
  for (const v of values ?? []) {
    if (!valuesByTask.has(v.node_id)) valuesByTask.set(v.node_id, new Map())
    valuesByTask.get(v.node_id)!.set(v.field_id, v.value)
  }

  function moveToStatus(task: TaskSummary, statusId: string) {
    const lastInColumn = tasks
      .filter((t) => t.status_id === statusId && t.id !== task.id)
      .sort((a, b) => b.position - a.position)[0]
    const position = between(lastInColumn?.position, undefined)
    moveMutation.mutate({ taskId: task.id, statusId, position })
  }

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
            <th className="px-2 py-2">Estado</th>
            <th className="px-2 py-2">Prioridad</th>
            <th className="px-2 py-2">Asignados</th>
            {fields?.map((field) => (
              <th key={field.id} className="min-w-32 px-2 py-2">
                {field.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const currentStatus = statuses.find((s) => s.id === task.status_id)
            const isDone = isDoneStatus(currentStatus?.status_kind)
            const taskValues = valuesByTask.get(task.id)

            return (
              <TableRow
                key={task.id}
                task={task}
                projectId={projectId}
                statuses={statuses}
                fields={fields ?? []}
                values={taskValues}
                isDone={isDone}
                selected={selectedIds.has(task.id)}
                onMoveToStatus={(statusId) => moveToStatus(task, statusId)}
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

// Fila propia (no inline en el .map de arriba): useUpdateTaskFieldsMutation/
// useUpsertCustomFieldValueMutation son hooks — llamarlos una vez por fila
// necesita que cada fila sea su propio componente, no una función anónima
// dentro de un .map().
function TableRow({
  task,
  projectId,
  statuses,
  fields,
  values,
  isDone,
  selected,
  onMoveToStatus,
  onOpen,
}: {
  task: TaskSummary
  projectId: string
  statuses: StatusSummary[]
  fields: CustomFieldDefinition[]
  values: Map<string, Json> | undefined
  isDone: boolean
  selected: boolean
  onMoveToStatus: (statusId: string) => void
  onOpen: (e: React.MouseEvent) => void
}) {
  const updateMutation = useUpdateTaskFieldsMutation(projectId, task.id)
  const upsertFieldMutation = useUpsertCustomFieldValueMutation(task.id, projectId)

  return (
    <tr className={cn('border-b border-border/60 last:border-0 hover:bg-surface-alt', selected && 'bg-accent-soft')}>
      <td className="px-2 py-1.5">
        <Checkbox
          checked={isDone}
          aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
          onCheckedChange={() => {
            const doneStatus = statuses.find((s) => s.status_kind === 'success')
            const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0]
            const target = isDone ? defaultStatus : doneStatus
            if (target) onMoveToStatus(target.id)
          }}
        />
      </td>
      <td className="max-w-64 px-2 py-1.5">
        <Link
          to="/p/$projectId/t/$taskId"
          params={{ projectId, taskId: task.id }}
          onClick={onOpen}
          className={cn('block truncate hover:underline', isDone && 'text-text-muted line-through')}
        >
          {task.title}
        </Link>
      </td>
      <td className="px-2 py-1.5">
        <Select value={task.status_id ?? undefined} onValueChange={onMoveToStatus}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((status) => (
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
      {fields.map((field) => (
        <td key={field.id} className="min-w-32 px-2 py-1.5">
          <CustomFieldCell
            field={field}
            value={values?.get(field.id)}
            onChange={(value) => upsertFieldMutation.mutate({ fieldId: field.id, value })}
          />
        </td>
      ))}
    </tr>
  )
}
