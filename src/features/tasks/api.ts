import { supabase } from '@/lib/supabase'
import { fetchTaskNode, fetchTaskSummary, type TaskSummary, type PersonalTaskRow } from '@/features/tasks/queries'

export interface NewTaskInput {
  id: string
  containerId: string
  title: string
  statusId: string
  position: number
  priority?: string
  assigneeId?: string | null
  dueDate?: string | null
  dueTime?: string | null
  startDate?: string | null
  startTime?: string | null
  isMilestone?: boolean
  parentId?: string | null
}

// Solo el INSERT (RPC `create_task_node`), sin ningún fetch de vuelta —
// exportada aparte para que useCreateSubtaskMutation pueda saltarse el
// round-trip de lectura de `createTask` (ver esa función, más abajo, para
// el motivo). Inserta `nodes` (+ `node_memberships` si no es subtarea) en
// una transacción y resuelve `workspace_id` server-side desde el
// container — nunca se manda desde el cliente.
export async function insertTaskNode(input: NewTaskInput): Promise<void> {
  const { error } = await supabase.rpc('create_task_node', {
    p_id: input.id,
    p_container_id: input.containerId,
    p_title: input.title,
    p_status_id: input.statusId,
    p_position: input.position,
    p_priority: input.priority ?? 'medium',
    // `?? undefined` (no `?? null`): la RPC tipa estos args opcionales
    // como `string | undefined` (Postgres los toma con su DEFAULT null
    // si se omiten) — "sin asignar"/"sin fecha"/"sin padre" y "no
    // especificado" resuelven al mismo estado final, así que colapsar
    // null->undefined acá es correcto, no una pérdida de información.
    p_assignee_id: input.assigneeId ?? undefined,
    p_due_date: input.dueDate ?? undefined,
    p_due_time: input.dueTime ?? undefined,
    p_parent_id: input.parentId ?? undefined,
    p_start_date: input.startDate ?? undefined,
    p_start_time: input.startTime ?? undefined,
    p_is_milestone: input.isMilestone ?? undefined,
  })
  if (error) throw error
}

// Único camino soportado para crear una tarea de proyecto (no subtarea —
// ver useCreateSubtaskMutation en mutations.ts, que llama insertTaskNode
// directo). Además del INSERT, hace un round-trip de lectura para
// devolver el TaskSummary completo (assignee/etiquetas/etc. embebidos),
// que useCreateTaskMutation necesita para su propio cache.
export async function createTask(input: NewTaskInput): Promise<TaskSummary> {
  await insertTaskNode(input)

  // Subtareas no reciben fila en node_memberships: fetchTaskSummary (que
  // consulta node_memberships) fallaría con "no rows". Se arma el
  // TaskSummary a mano con el position/containerId ya conocidos por el
  // caller.
  if (input.parentId) {
    const node = await fetchTaskNode(input.id)
    return { ...node, position: input.position, container_id: input.containerId }
  }
  return fetchTaskSummary(input.id, input.containerId)
}

export interface TaskFieldsUpdate {
  title?: string
  description?: string
  status_id?: string
  assignee_id?: string | null
  priority?: string
  due_date?: string | null
  due_time?: string | null
  start_date?: string | null
  start_time?: string | null
  is_milestone?: boolean
  // Solo lo usan las tareas de "Lista personal" (sin proyecto, sin
  // status_id/status_kind — ver 0015_my_tasks.sql). Las tareas de
  // proyecto resuelven "hecha" vía status_kind, no tocan este campo.
  completed_at?: string | null
}

// Regla de repetición editable desde el cliente — mismo shape que
// `task_recurrences` menos `id`/`node_id`/`created_at` (los resuelve el
// servidor). Sin RPC de escritura: mismo patrón que `task_dependencies`
// (0011), el cliente escribe directo y la RLS `with check` valida
// pertenencia al workspace.
export interface TaskRecurrenceInput {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  daysOfWeek?: number[] | null
  endsOn?: string | null
  occurrencesLeft?: number | null
}

export async function upsertTaskRecurrence(nodeId: string, rule: TaskRecurrenceInput) {
  const { error } = await supabase.from('task_recurrences').upsert(
    {
      node_id: nodeId,
      frequency: rule.frequency,
      interval: rule.interval,
      days_of_week: rule.daysOfWeek ?? null,
      ends_on: rule.endsOn ?? null,
      occurrences_left: rule.occurrencesLeft ?? null,
    },
    { onConflict: 'node_id' },
  )
  if (error) throw error
}

export async function deleteTaskRecurrence(nodeId: string) {
  const { error } = await supabase.from('task_recurrences').delete().eq('node_id', nodeId)
  if (error) throw error
}

interface NewPersonalTaskInput {
  id: string
  workspaceId: string
  userId: string
  title: string
  priority?: string
  dueDate?: string | null
}

// A diferencia de `createTask`, no pasa por la RPC `create_task_node`:
// una tarea personal no tiene container/posición que coordinar en
// `node_memberships` (no tiene proyecto), así que un insert directo a
// `nodes` alcanza — mismo nivel de confianza que ya usa
// `updateTaskFields` más abajo. RLS `nodes_all_member` (is_member_of)
// ya lo permite sin necesidad de una función server-side.
export async function createPersonalTask(input: NewPersonalTaskInput): Promise<PersonalTaskRow> {
  const { data, error } = await supabase
    .from('nodes')
    .insert({
      id: input.id,
      workspace_id: input.workspaceId,
      type: 'task',
      title: input.title,
      priority: input.priority ?? 'medium',
      due_date: input.dueDate ?? null,
      assignee_id: input.userId,
      created_by: input.userId,
    })
    .select('id, title, priority, due_date, completed_at')
    .single()
  if (error) throw error
  return { ...data, task_labels: [] }
}

export async function updateTaskFields(nodeId: string, fields: TaskFieldsUpdate) {
  const { error } = await supabase.from('nodes').update(fields).eq('id', nodeId)
  if (error) throw error
}

export async function moveTask(nodeId: string, containerId: string, statusId: string, position: number) {
  const { error } = await supabase.rpc('move_task_node', {
    p_node_id: nodeId,
    p_container_id: containerId,
    p_status_id: statusId,
    p_position: position,
  })
  if (error) throw error
}

export async function deleteTask(nodeId: string) {
  const { error } = await supabase.from('nodes').delete().eq('id', nodeId)
  if (error) throw error
}

// "Dejarlas abiertas, fuera de esta tarea" del diálogo de cierre con
// subtareas — conserva el status_id actual (0081_close_with_subtasks.sql
// resuelve la posición server-side, entre los demás miembros del
// contenedor que ya comparten ese mismo estado).
export async function promoteSubtaskToTask(nodeId: string, containerId: string) {
  const { error } = await supabase.rpc('promote_subtask_to_task', {
    p_node_id: nodeId,
    p_container_id: containerId,
  })
  if (error) throw error
}

export async function rebalancePositions(containerId: string) {
  const { error } = await supabase.rpc('rebalance_positions', { p_container_id: containerId })
  if (error) throw error
}

// Duplica una tarea (con subtareas de un nivel, etiquetas y responsables)
// vía la RPC duplicate_task_node (0047) — devuelve el id del nodo nuevo.
export async function duplicateTask(
  sourceId: string,
  containerId: string,
  statusId: string,
  position: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_task_node', {
    p_source_id: sourceId,
    p_container_id: containerId,
    p_status_id: statusId,
    p_position: position,
  })
  if (error) throw error
  return data
}
