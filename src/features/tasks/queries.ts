import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { Json } from '@/features/nodes/types'

export type TaskLabelSummary = Pick<Database['public']['Tables']['labels']['Row'], 'id' | 'name' | 'color'>
export type ProfileSummary = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'avatar_url'>

// Responsables múltiples (0041_task_assignees.sql) — `assignee_id`/`assignee`
// se mantienen tal cual (responsable principal, ver create_task_node y el
// feed de Calendar) y esto se agrega en paralelo como la fuente de verdad
// para avatar-stack, filtro y carga de trabajo.
export interface TaskAssigneeSummary {
  user_id: string
  // No-nulo (a diferencia de `TaskSummary.assignee`): `task_assignees.user_id`
  // es NOT NULL con `references profiles(id) on delete cascade` — si el
  // perfil se borra, la fila de task_assignees se borra con él, nunca
  // queda un user_id huérfano que resolver a null.
  assignee: ProfileSummary
}

export interface TaskSummary {
  id: string
  title: string
  status_id: string | null
  assignee_id: string | null
  priority: string
  due_date: string | null
  due_time: string | null
  start_date: string | null
  start_time: string | null
  is_milestone: boolean
  // Cuándo se completó de verdad (0072_task_completion_tracking.sql) —
  // distinto de `due_date` (cuándo debía completarse). Alimenta
  // formatDeliveryState (delivery-state.ts) para distinguir "vencida,
  // sigue abierta" de "se entregó tarde", que antes se veían igual.
  completed_at: string | null
  // Derivado de la fila embebida `task_recurrences` (ver flattenTaskRow) —
  // solo importa si existe o no, así que se colapsa a boolean acá en vez
  // de exponer el array crudo a cada consumidor.
  has_recurrence: boolean
  position: number
  parent_id: string | null
  container_id: string
  custom_fields: Json
  created_at: string
  assignee: ProfileSummary | null
  task_assignees: TaskAssigneeSummary[]
  task_labels: { label: TaskLabelSummary }[]
  // Solo presente cuando se pide `includeDescription: true` (ver
  // tasksQueryOptions) — evita cargar HTML por fila cuando nadie lo va a
  // mostrar (board, o list.tsx con el toggle de descripción apagado).
  description?: string | null
}

// Shape crudo de `node_memberships` con `nodes` embebido — se tipa a mano
// en vez de confiar en la inferencia de supabase-js sobre un `.select()`
// multilínea con doble embed anidado (node_memberships -> nodes ->
// assignee/task_labels), que no siempre resuelve limpio. Verificado
// contra el endpoint REST real antes de escribir esto (mismo shape).
interface RawTaskMembershipRow {
  position: number
  node: {
    id: string
    title: string
    status_id: string | null
    assignee_id: string | null
    priority: string
    due_date: string | null
    due_time: string | null
    start_date: string | null
    start_time: string | null
    is_milestone: boolean
    completed_at: string | null
    parent_id: string | null
    custom_fields: Json
    created_at: string
    assignee: ProfileSummary | null
    task_labels: { label: TaskLabelSummary }[]
    // Solo se pide el `node_id` (nunca se usa) — el embed sirve únicamente
    // para saber si la fila existe, ver flattenTaskRow.
    //
    // OBJETO O NULL, no un array: `task_recurrences.node_id` tiene un UNIQUE
    // (0021_task_scheduling_v2.sql), y PostgREST usa esa unicidad para inferir
    // que la relación es uno-a-uno. Estaba tipado como array y el `.length` de
    // flattenTaskRow reventaba con "Cannot read properties of null" en cuanto
    // PostgREST recargó su schema cache y empezó a devolver la forma correcta.
    // Si algún día se quita ese UNIQUE, esto vuelve a ser un array.
    task_recurrences: { node_id: string } | null
    task_assignees: TaskAssigneeSummary[]
    description?: string | null
  }
}

// Sin `description` acá: evita cargar HTML potencialmente largo por fila
// en una lista de 100+ tareas (presupuesto de egress) cuando nadie lo va
// a mostrar. `taskNodeFields(true)` la agrega para los casos que sí la
// necesitan (list.tsx con el toggle de descripción prendido).
function taskNodeFields(includeDescription: boolean) {
  return `
  id, title, status_id, assignee_id, priority, due_date, due_time, start_date, start_time, is_milestone, completed_at, parent_id, custom_fields, created_at${includeDescription ? ', description' : ''},
  assignee:profiles!nodes_assignee_id_fkey ( id, full_name, avatar_url ),
  task_assignees ( user_id, assignee:profiles!task_assignees_user_id_fkey ( id, full_name, avatar_url ) ),
  task_labels ( label:labels ( id, name, color ) ),
  task_recurrences ( node_id )
`
}

const TASK_NODE_FIELDS = taskNodeFields(false)

// Compartido con el patch de Realtime (src/lib/realtime.ts): el INSERT
// de otro usuario no trae los joins en el payload de Postgres Changes,
// así que se hace un fetch puntual de 1 fila con este mismo shape. La
// raíz es `nodes!node_memberships_node_id_fkey` (no `nodes!inner` a
// secas): `node_memberships` tiene 2 FKs a `nodes` (node_id y
// container_id), hace falta el hint para desambiguar cuál embeber.
function taskNodeSelect(includeDescription: boolean) {
  return `
  position,
  node:nodes!inner!node_memberships_node_id_fkey ( ${taskNodeFields(includeDescription)} )
`
}

export const TASK_NODE_SELECT = taskNodeSelect(false)

function flattenTaskRow(row: RawTaskMembershipRow, containerId: string): TaskSummary {
  const { task_recurrences, ...node } = row.node
  return { ...node, has_recurrence: task_recurrences != null, position: row.position, container_id: containerId }
}

// Fetch de un nodo tarea SIN pasar por node_memberships — necesario para
// subtareas, que nunca reciben fila de membership (ver PLAN.md §4.2), a
// diferencia de `fetchTaskSummary` que sí requiere una. Usado por
// `createTask` en api.ts cuando `input.parentId` está presente.
export async function fetchTaskNode(nodeId: string): Promise<Omit<TaskSummary, 'position' | 'container_id'>> {
  const { data, error } = await supabase.from('nodes').select(TASK_NODE_FIELDS).eq('id', nodeId).single()
  if (error) throw error
  const { task_recurrences, ...node } = data as unknown as RawTaskMembershipRow['node']
  return { ...node, has_recurrence: task_recurrences != null }
}

// `description` es opt-in (`includeDescription`): evita cargar HTML
// potencialmente largo por fila en una lista de 100+ tareas (presupuesto
// de egress) para los consumidores que no la muestran (board, o list.tsx
// con el toggle de descripción apagado) — ver src/features/nodes/list-fields.ts.
// `includeDescription` entra en la queryKey para que ambas variantes
// cacheen por separado sin pisarse. Las labels se embeben acá (no una
// query aparte) porque board/list necesitan la misma data tanto para
// renderizar chips como para filtrar client-side. La raíz de la query es
// `node_memberships` (no `nodes`): es la tabla que define "qué tareas
// están en este contenedor" bajo multi-homing — ver PLAN.md §4.2.
// Subtareas nunca tienen fila en `node_memberships`, así que este filtro
// ya excluye subtareas sin necesidad de un `.is()` extra (a diferencia
// del viejo `.is('parent_task_id', null)`).
export const tasksQueryOptions = (containerId: string, opts: { includeDescription?: boolean } = {}) => {
  const includeDescription = opts.includeDescription ?? false
  return queryOptions({
    queryKey: ['tasks', containerId, includeDescription] as const,
    queryFn: async (): Promise<TaskSummary[]> => {
      const { data, error } = await supabase
        .from('node_memberships')
        .select(taskNodeSelect(includeDescription))
        .eq('container_id', containerId)
        .order('position', { ascending: true })
      if (error) throw error
      return (data as unknown as RawTaskMembershipRow[]).map((row) => flattenTaskRow(row, containerId))
    },
    enabled: !!containerId,
  })
}

interface RawSubtreeTaskRow extends RawTaskMembershipRow {
  container_id: string
}

// Vista de carpeta/espacio (F5 #2.2): tareas de TODOS los proyectos del
// subárbol de un nodo en un solo round-trip, no un `useTasks` por
// proyecto. A diferencia de `tasksQueryOptions` (un solo `containerId`
// fijo), acá cada fila puede pertenecer a un proyecto distinto, así que
// `container_id` se pide en el select y se lee por fila en vez de
// pasarse como parámetro compartido. Sin `.order('position')`: la
// posición solo tiene sentido dentro de un mismo tablero, no tiene un
// orden global entre proyectos distintos.
export const subtreeTasksQueryOptions = (containerIds: string[]) =>
  queryOptions({
    queryKey: ['tasks', 'subtree', [...containerIds].sort()] as const,
    queryFn: async (): Promise<TaskSummary[]> => {
      if (containerIds.length === 0) return []
      const { data, error } = await supabase
        .from('node_memberships')
        .select(`container_id, ${taskNodeSelect(false)}`)
        .in('container_id', containerIds)
      if (error) throw error
      return (data as unknown as RawSubtreeTaskRow[]).map((row) => flattenTaskRow(row, row.container_id))
    },
    enabled: containerIds.length > 0,
  })

export function useSubtreeTasks(containerIds: string[]) {
  return useQuery(subtreeTasksQueryOptions(containerIds))
}

export async function fetchTaskSummary(nodeId: string, containerId: string): Promise<TaskSummary> {
  const { data, error } = await supabase
    .from('node_memberships')
    .select(TASK_NODE_SELECT)
    .eq('node_id', nodeId)
    .eq('container_id', containerId)
    .single()
  if (error) throw error
  return flattenTaskRow(data as unknown as RawTaskMembershipRow, containerId)
}

export function useTasks(containerId: string, opts?: { includeDescription?: boolean }) {
  return useQuery(tasksQueryOptions(containerId, opts))
}

// Prefix de `tasksQueryOptions` sin el flag `includeDescription` — para
// cancel/invalidate/setQueriesData en mutations.ts y realtime.ts, que
// necesitan tocar AMBAS variantes cacheadas (con y sin descripción) en
// vez de fijarse a una sola vía `.queryKey` exacto (ver comentario en
// tasksQueryOptions sobre por qué el flag entra en la key).
export const tasksListKeyPrefix = (containerId: string) => ['tasks', containerId] as const

export const taskDetailQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: ['task', taskId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `
          id, title, description, status_id, assignee_id, priority, due_date, due_time,
          start_date, start_time, is_milestone, completed_at, is_private,
          parent_id, custom_fields, created_by, created_at, updated_at,
          assignee:profiles!nodes_assignee_id_fkey ( id, full_name, avatar_url ),
          creator:profiles!nodes_created_by_fkey ( id, full_name ),
          task_assignees ( user_id, assignee:profiles!task_assignees_user_id_fkey ( id, full_name, avatar_url ) ),
          task_labels ( label:labels ( id, name, color ) ),
          memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
        `,
        )
        .eq('id', taskId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!taskId,
  })

export function useTaskDetail(taskId: string) {
  return useQuery(taskDetailQueryOptions(taskId))
}

export type TaskRecurrenceRow = Database['public']['Tables']['task_recurrences']['Row']

// Solo se pide al abrir el panel de detalle (no vale la pena embeberla en
// cada fetch de lista más allá del booleano `has_recurrence` que ya trae
// TaskSummary) — `maybeSingle` porque la mayoría de las tareas no tienen
// fila acá (task_recurrences.node_id es 0-o-1, no 1-a-muchos).
export const taskRecurrenceQueryOptions = (nodeId: string) =>
  queryOptions({
    queryKey: ['task-recurrence', nodeId] as const,
    queryFn: async (): Promise<TaskRecurrenceRow | null> => {
      const { data, error } = await supabase
        .from('task_recurrences')
        .select('id, node_id, frequency, interval, days_of_week, ends_on, occurrences_left, created_at')
        .eq('node_id', nodeId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!nodeId,
  })

export function useTaskRecurrence(nodeId: string) {
  return useQuery(taskRecurrenceQueryOptions(nodeId))
}

export interface SubtaskSummary {
  id: string
  title: string
  status_id: string | null
  priority: string
  // Decisión de producto "Cerrar con subtareas abiertas": distingue una
  // subtarea "checklist" (sin due_date propio) de una "de alguien" (con
  // fecha, aunque no tenga responsable) — ver CloseWithSubtasksDialog.tsx.
  due_date: string | null
  status: Pick<Database['public']['Tables']['statuses']['Row'], 'id' | 'name' | 'status_kind'> | null
  // Un solo responsable, no un pool (a diferencia de las tareas de
  // proyecto, que sí usan task_assignees) — decisión explícita del
  // usuario: una subtarea es la unidad atómica en la que ya se dividió
  // el trabajo, así que no necesita "varios asignados" propio; si hacen
  // falta dos personas, la señal es que en realidad son dos subtareas.
  // Mismo campo escalar que ya existía para el "responsable principal"
  // de una tarea de proyecto (nodes.assignee_id, ver 0041_task_assignees.sql)
  // — para una subtarea, es directamente SU ÚNICO responsable, no un
  // "principal entre varios".
  assignee_id: string | null
  assignee: ProfileSummary | null
}

// Orden por `created_at` (no `position`): `nodes` no tiene columna de
// posición fraccional — esa noción vive en `node_memberships`, y las
// subtareas deliberadamente no participan en `node_memberships` (ver
// PLAN.md §4.2). `SubtaskList.tsx` no tiene UI de reordenamiento, así
// que este cambio de orden no es una regresión funcional.
export const subtasksQueryOptions = (parentId: string, opts: { enabled?: boolean } = {}) =>
  queryOptions({
    queryKey: ['subtasks', parentId] as const,
    queryFn: async (): Promise<SubtaskSummary[]> => {
      // `statuses!nodes_status_id_fkey`, no `statuses` a secas: hay DOS FK
      // entre `nodes` y `statuses` en direcciones opuestas
      // (`statuses.project_id -> nodes.id` Y `nodes.status_id ->
      // statuses.id`), y sin el hint explícito PostgREST no puede
      // resolver cuál usar — devuelve "more than one relationship was
      // found" en cada llamada. Cada otro lugar del código que hace este
      // mismo embed (queries.ts más abajo, reports/queries.ts,
      // favorites/queries.ts) ya usa el hint; a esta consulta se le
      // había quedado afuera. Como useSubtasks solo lee `data` (nunca
      // `error`), el fallo quedaba silencioso: la sección de subtareas
      // se veía vacía en cada carga fresca (nunca aparecían, y
      // refrescar la página no ayudaba porque volvía a fallar) —
      // reportado por el usuario.
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `id, title, status_id, priority, due_date, status:statuses!nodes_status_id_fkey ( id, name, status_kind ),
           assignee_id, assignee:profiles!nodes_assignee_id_fkey ( id, full_name, avatar_url )`,
        )
        .eq('parent_id', parentId)
        .eq('type', 'task')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    // `enabled` opcional (default true, mismo comportamiento que antes de
    // este parámetro): TaskRow.tsx en Lista lo pasa en `false` hasta que
    // la fila se expande — mostrar subtareas inline (pedido explícito
    // del usuario, criterio ClickUp) no debe disparar un fetch por CADA
    // tarea de la lista con solo montarse, sería un N+1 real en una
    // lista de cientos.
    enabled: !!parentId && (opts.enabled ?? true),
  })

export function useSubtasks(parentId: string, opts: { enabled?: boolean } = {}) {
  return useQuery(subtasksQueryOptions(parentId, opts))
}

// Cuántas subtareas tiene cada tarea de una lista — un solo round-trip
// (parent_id de cualquiera que esté entre los ids dados) en vez de un
// useSubtasks por fila solo para saber "¿mostrar el toggle de expandir o
// no?". El conteo real se arma client-side (mismo criterio que el
// filtro de "raíz" de archivedNodesQueryOptions) en vez de un `count()`
// agrupado en SQL — más simple de razonar con el resto del código, que
// ya sigue ese patrón para agregaciones chicas.
export const subtaskCountsQueryOptions = (parentIds: string[]) =>
  queryOptions({
    queryKey: ['subtask-counts', [...parentIds].sort()] as const,
    queryFn: async (): Promise<Record<string, number>> => {
      if (parentIds.length === 0) return {}
      const { data, error } = await supabase
        .from('nodes')
        .select('parent_id')
        .in('parent_id', parentIds)
        .eq('type', 'task')
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data) {
        const parentId = row.parent_id as string
        counts[parentId] = (counts[parentId] ?? 0) + 1
      }
      return counts
    },
    enabled: parentIds.length > 0,
  })

export function useSubtaskCounts(parentIds: string[]) {
  return useQuery(subtaskCountsQueryOptions(parentIds))
}

export interface WorkspaceTaskSearchRow {
  id: string
  title: string
  projectId: string | null
  projectName: string | null
}

interface RawWorkspaceTaskSearchRow {
  id: string
  title: string
  memberships: { container_id: string; container: { title: string } | null }[]
}

// Búsqueda de ⌘K: a diferencia de `myTasksQueryOptions` (acotada al
// usuario actual) y `tasksQueryOptions` (acotada a un proyecto), esta
// busca por título en TODO el workspace — CommandPalette la usa para que
// buscar una tarea no dependa de estar parado en su proyecto. `nodes` es
// la raíz (no `node_memberships`) por el mismo motivo que
// `myTasksQueryOptions`: `workspace_id` vive directo en `nodes`, sin
// necesidad de join para scopear. `container:nodes!node_memberships_container_id_fkey`
// trae el nombre del proyecto para mostrarlo como chip junto al resultado.
export const workspaceTaskSearchQueryOptions = (workspaceId: string, search: string) => {
  const term = search.trim()
  return queryOptions({
    queryKey: ['workspace-task-search', workspaceId, term] as const,
    queryFn: async (): Promise<WorkspaceTaskSearchRow[]> => {
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `
          id, title,
          memberships:node_memberships!node_memberships_node_id_fkey (
            container_id,
            container:nodes!node_memberships_container_id_fkey ( title )
          )
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('type', 'task')
        .is('parent_id', null)
        .ilike('title', `%${term}%`)
        .limit(8)
      if (error) throw error
      return (data as unknown as RawWorkspaceTaskSearchRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        projectId: row.memberships[0]?.container_id ?? null,
        projectName: row.memberships[0]?.container?.title ?? null,
      }))
    },
    enabled: !!workspaceId && term.length > 0,
  })
}

export function useWorkspaceTaskSearch(workspaceId: string, search: string) {
  return useQuery(workspaceTaskSearchQueryOptions(workspaceId, search))
}

export interface MyTaskRow {
  id: string
  title: string
  status_id: string | null
  priority: string
  due_date: string | null
  completed_at: string | null
  parent_id: string | null
  task_labels: { label: TaskLabelSummary }[]
  status: Pick<Database['public']['Tables']['statuses']['Row'], 'id' | 'name' | 'status_kind'> | null
  projectId: string | null
  // Solo presente en `delegatedTasksQueryOptions` — a quién se le
  // delegó la tarea. `myTasksQueryOptions` no lo trae (ahí "quién" es
  // siempre el propio usuario).
  assignee?: ProfileSummary | null
}

interface RawMyTaskRow {
  id: string
  title: string
  status_id: string | null
  priority: string
  due_date: string | null
  completed_at: string | null
  parent_id: string | null
  task_labels: { label: TaskLabelSummary }[]
  status: Pick<Database['public']['Tables']['statuses']['Row'], 'id' | 'name' | 'status_kind'> | null
  memberships: { container_id: string }[]
}

// Home page "Mis tareas": la única query que lee `nodes` sin pasar por
// `node_memberships` como raíz, porque acá el filtro es por
// `assignee_id`, no por "qué contenedor" — `workspace_id` vive directo
// en `nodes` (ver PLAN.md §4.1), así que no hace falta ningún join para
// scopear por workspace. `.is('parent_id', null)` excluye subtareas: no
// tienen fila en `node_memberships` (PLAN.md §4.2), así que no habría
// proyecto al cual enlazarlas en la UI. Multi-homing: si una tarea
// pertenece a >1 proyecto se toma memberships[0] — misma simplificación
// que ya asume TaskRow/TaskCard en otros lados. El hint `!nodes_status_id_fkey`
// es obligatorio: `nodes` y `statuses` tienen 2 relaciones (nodes.status_id
// -> statuses.id, y statuses.project_id -> nodes.id), PostgREST no puede
// desambiguar un embed `statuses(...)` sin el nombre de FK explícito.
export const myTasksQueryOptions = (workspaceId: string, userId: string | undefined) =>
  queryOptions({
    queryKey: ['my-tasks', workspaceId, userId] as const,
    queryFn: async (): Promise<MyTaskRow[]> => {
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `
          id, title, status_id, priority, due_date, completed_at, parent_id,
          task_labels ( label:labels ( id, name, color ) ),
          status:statuses!nodes_status_id_fkey ( id, name, status_kind ),
          memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('type', 'task')
        .eq('assignee_id', userId as string)
        .is('parent_id', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(100)
      if (error) throw error
      return (data as unknown as RawMyTaskRow[]).map(({ memberships, ...row }) => ({
        ...row,
        projectId: memberships[0]?.container_id ?? null,
      }))
    },
    enabled: !!workspaceId && !!userId,
  })

interface RawDelegatedTaskRow extends RawMyTaskRow {
  assignee: ProfileSummary | null
}

// "Delegado": tareas que yo creé pero asigné a otra persona. Sin
// migración/tabla nueva — `created_by` ya existe en `nodes` desde
// 0008_nodes_engine.sql. `.neq('assignee_id', userId)` + `.not('assignee_id',
// 'is', null)`: excluye tanto "sin asignar" como "asignada a mí mismo"
// (eso es `myTasksQueryOptions`, no esto).
export const delegatedTasksQueryOptions = (workspaceId: string, userId: string | undefined) =>
  queryOptions({
    queryKey: ['delegated-tasks', workspaceId, userId] as const,
    queryFn: async (): Promise<MyTaskRow[]> => {
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `
          id, title, status_id, priority, due_date, completed_at, parent_id,
          task_labels ( label:labels ( id, name, color ) ),
          status:statuses!nodes_status_id_fkey ( id, name, status_kind ),
          assignee:profiles!nodes_assignee_id_fkey ( id, full_name, avatar_url ),
          memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('type', 'task')
        .eq('created_by', userId as string)
        .not('assignee_id', 'is', null)
        .neq('assignee_id', userId as string)
        .is('parent_id', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(100)
      if (error) throw error
      return (data as unknown as RawDelegatedTaskRow[]).map(({ memberships, ...row }) => ({
        ...row,
        projectId: memberships[0]?.container_id ?? null,
      }))
    },
    enabled: !!workspaceId && !!userId,
  })

export interface UnassignedRequestedTaskRow extends MyTaskRow {
  created_at: string
}

interface RawUnassignedRequestedTaskRow extends RawMyTaskRow {
  created_at: string
}

// D2 ("Quién queda a cargo al crear"), regla A6: tareas que YO pedí
// (created_by) y que nadie tomó todavía (assignee_id null) — el
// contrapeso de `delegatedTasksQueryOptions` (esa es "ya tiene dueño,
// pero no soy yo"; esta es "todavía no tiene ninguno"). `created_at` es
// la única señal de "desde cuándo" que existe en el schema — no hay un
// timestamp propio de "se quedó sin dueño"; si alguien la desasigna
// después de haber tenido responsable, esto la trata igual que si nunca
// lo hubiera tenido (caso raro, aceptado). Se pide sin filtrar por
// status_kind (igual que `myTasksQueryOptions`) — el componente decide
// qué mostrar, mismo criterio que `MyWorkWidget` ya usa para "pendiente"
// vs "terminado".
export const unassignedRequestedTasksQueryOptions = (workspaceId: string, userId: string | undefined) =>
  queryOptions({
    queryKey: ['unassigned-requested-tasks', workspaceId, userId] as const,
    queryFn: async (): Promise<UnassignedRequestedTaskRow[]> => {
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `
          id, title, status_id, priority, due_date, completed_at, parent_id, created_at,
          task_labels ( label:labels ( id, name, color ) ),
          status:statuses!nodes_status_id_fkey ( id, name, status_kind ),
          memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('type', 'task')
        .eq('created_by', userId as string)
        .is('assignee_id', null)
        .is('parent_id', null)
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) throw error
      return (data as unknown as RawUnassignedRequestedTaskRow[]).map(({ memberships, ...row }) => ({
        ...row,
        projectId: memberships[0]?.container_id ?? null,
      }))
    },
    enabled: !!workspaceId && !!userId,
  })

export function useUnassignedRequestedTasks(workspaceId: string, userId: string | undefined) {
  return useQuery(unassignedRequestedTasksQueryOptions(workspaceId, userId))
}

export interface PersonalTaskRow {
  id: string
  title: string
  priority: string
  due_date: string | null
  completed_at: string | null
  task_labels: { label: TaskLabelSummary }[]
}

interface RawPersonalTaskRow extends PersonalTaskRow {
  memberships: { container_id: string }[]
}

// "Lista personal": tareas sin proyecto — `type='task'`, creadas por mí,
// SIN ninguna fila en `node_memberships` (eso es justamente lo que las
// distingue de una tarea de proyecto sin asignar todavía). No hay
// columna que marque esto directo, así que se trae `memberships` igual
// que el resto de las queries de esta página y se filtra client-side
// por `memberships.length === 0` — mismo patrón que ya usa
// `myTasksQueryOptions` para resolver `projectId`, acá para lo opuesto.
export const personalTasksQueryOptions = (workspaceId: string, userId: string | undefined) =>
  queryOptions({
    queryKey: ['personal-tasks', workspaceId, userId] as const,
    queryFn: async (): Promise<PersonalTaskRow[]> => {
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `
          id, title, priority, due_date, completed_at,
          task_labels ( label:labels ( id, name, color ) ),
          memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('type', 'task')
        .eq('created_by', userId as string)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as unknown as RawPersonalTaskRow[])
        .filter((row) => row.memberships.length === 0)
        .map(({ memberships: _memberships, ...row }) => row)
    },
    enabled: !!workspaceId && !!userId,
  })
