import { queryOptions, useQuery } from '@tanstack/react-query'
import { startOfISOWeek, subWeeks, format as formatDate } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { isClosedStatus, isDoneStatus } from '@/features/projects/status-kind'
import { formatDueDate } from '@/lib/format-date'

// Los tres reportes leen `nodes` directo con el cliente normal (anon key +
// sesión), nunca por una RPC/vista `security definer` — así la RLS de
// `nodes_access` (0035) filtra estas listas exactamente igual que filtra el
// board o la lista de cualquiera. Alguien con rol restringido sin acceso a
// un espacio no aporta sus tareas a ningún agregado de acá, porque las
// filas ni siquiera llegan al cliente — no hay nada que "sumar de más" que
// después haya que descontar.

// ============================================================
// Carga actual por persona
// ============================================================
export interface PersonWorkload {
  userId: string
  fullName: string | null
  avatarUrl: string | null
  openCount: number
  urgentCount: number
  /** Nuevo (rediseño de Equipo, 2026-09-24): abiertas Y con `due_date`
   * vencida — el mismo criterio que ya usa `overdueByProjectQueryOptions`
   * más abajo, acá agrupado por persona en vez de por proyecto. */
  overdueCount: number
  /** Listas donde esta persona tiene al menos una tarea abierta asignada —
   * `equipos.tsx` suma esto por integrante para mostrar "listas donde
   * participa" en la tarjeta de cada equipo, sin una segunda query. */
  projectIds: string[]
}

interface RawWorkloadRow {
  user_id: string
  assignee: { id: string; full_name: string | null; avatar_url: string | null }
  node: {
    priority: string
    due_date: string | null
    status: { status_kind: string } | null
    memberships: { container_id: string }[]
  }
}

// Raíz `task_assignees` (no `nodes`): una tarea con 3 responsables debe
// contar una vez POR PERSONA, no una vez total — eso es justo lo que da
// iterar la tabla de unión en vez de la columna escalar `assignee_id`
// (0041_task_assignees.sql). `nodes!inner` (no un embed simple): permite
// filtrar por `node.workspace_id`/`node.type`/`node.parent_id` empujando
// el filtro al join, mismo patrón que ya usa `taskNodeSelect` en
// tasks/queries.ts (`nodes!inner!node_memberships_node_id_fkey`).
//
// Única query para todo el rediseño de Equipo (2026-09-24, "una query
// nueva, y solo una"): además de abiertas/urgentes ya calculadas para
// Reportes, ahora también trae `due_date` y la lista/proyecto de cada
// tarea — lo que hace falta para las filas de Personas (atrasadas) y,
// sumado por integrante, para las tarjetas de Equipos (atrasadas y
// listas donde participa). Nadie más pide esto de nuevo: Personas y
// Equipos leen este mismo resultado vía `useWorkloadByPerson`.
export const workloadByPersonQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['reports', 'workload', workspaceId] as const,
    queryFn: async (): Promise<PersonWorkload[]> => {
      const { data, error } = await supabase
        .from('task_assignees')
        .select(
          `
          user_id,
          assignee:profiles!task_assignees_user_id_fkey ( id, full_name, avatar_url ),
          node:nodes!inner (
            priority,
            due_date,
            status:statuses!nodes_status_id_fkey ( status_kind ),
            memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
          )
        `,
        )
        .eq('node.workspace_id', workspaceId)
        .eq('node.type', 'task')
        .is('node.parent_id', null)
        .limit(2000)
      if (error) throw error

      const byPerson = new Map<string, PersonWorkload & { _projectIds: Set<string> }>()
      for (const row of data as unknown as RawWorkloadRow[]) {
        // isClosedStatus, no isDoneStatus: "carga de trabajo abierta" debe
        // excluir tanto hechas como descartadas (status-kind.ts).
        if (isClosedStatus(row.node.status?.status_kind)) continue
        const overdue = !!row.node.due_date && formatDueDate(row.node.due_date).state === 'overdue'
        const projectId = row.node.memberships[0]?.container_id
        const existing = byPerson.get(row.user_id)
        if (existing) {
          existing.openCount += 1
          if (row.node.priority === 'urgent') existing.urgentCount += 1
          if (overdue) existing.overdueCount += 1
          if (projectId) existing._projectIds.add(projectId)
        } else {
          const projectIds = new Set<string>()
          if (projectId) projectIds.add(projectId)
          byPerson.set(row.user_id, {
            userId: row.user_id,
            fullName: row.assignee.full_name,
            avatarUrl: row.assignee.avatar_url,
            openCount: 1,
            urgentCount: row.node.priority === 'urgent' ? 1 : 0,
            overdueCount: overdue ? 1 : 0,
            projectIds: [],
            _projectIds: projectIds,
          })
        }
      }
      return [...byPerson.values()]
        .map(({ _projectIds, ...person }) => ({ ...person, projectIds: [..._projectIds] }))
        .sort((a, b) => b.openCount - a.openCount)
    },
    enabled: !!workspaceId,
  })

export function useWorkloadByPerson(workspaceId: string) {
  return useQuery(workloadByPersonQueryOptions(workspaceId))
}

// ============================================================
// Vencidas vs a tiempo, por proyecto
// ============================================================
export interface ProjectOverdueStats {
  projectId: string
  projectName: string
  overdue: number
  onTime: number
}

interface RawOverdueRow {
  due_date: string
  status: { status_kind: string } | null
  memberships: { container_id: string }[]
}

export const overdueByProjectQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['reports', 'overdue-by-project', workspaceId] as const,
    queryFn: async (): Promise<ProjectOverdueStats[]> => {
      const [{ data: tasks, error: tasksError }, { data: projects, error: projectsError }] = await Promise.all([
        supabase
          .from('nodes')
          .select(
            `
            due_date,
            status:statuses!nodes_status_id_fkey ( status_kind ),
            memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
          `,
          )
          .eq('workspace_id', workspaceId)
          .eq('type', 'task')
          .not('due_date', 'is', null)
          .is('parent_id', null)
          .limit(2000),
        supabase.from('nodes').select('id, name:title').eq('workspace_id', workspaceId).eq('type', 'project'),
      ])
      if (tasksError) throw tasksError
      if (projectsError) throw projectsError

      const nameByProject = new Map((projects ?? []).map((p) => [p.id, p.name]))
      const byProject = new Map<string, { overdue: number; onTime: number }>()
      for (const row of tasks as unknown as RawOverdueRow[]) {
        // Mismo motivo que arriba: vencida/a-tiempo solo aplica a trabajo
        // todavía activo.
        if (isClosedStatus(row.status?.status_kind)) continue
        const projectId = row.memberships[0]?.container_id
        if (!projectId) continue
        const bucket = byProject.get(projectId) ?? { overdue: 0, onTime: 0 }
        if (formatDueDate(row.due_date).state === 'overdue') bucket.overdue += 1
        else bucket.onTime += 1
        byProject.set(projectId, bucket)
      }

      return [...byProject.entries()]
        .map(([projectId, stats]) => ({ projectId, projectName: nameByProject.get(projectId) ?? '—', ...stats }))
        .sort((a, b) => b.overdue - a.overdue)
    },
    enabled: !!workspaceId,
  })

export function useOverdueByProject(workspaceId: string) {
  return useQuery(overdueByProjectQueryOptions(workspaceId))
}

// ============================================================
// Tareas completadas por semana
// ============================================================
export interface WeeklyCompletion {
  weekStart: string
  label: string
  count: number
}

interface RawWeeklyRow {
  updated_at: string
  status: { status_kind: string } | null
}

const WEEKS_BACK = 8

export const weeklyCompletionsQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['reports', 'weekly-completions', workspaceId] as const,
    queryFn: async (): Promise<WeeklyCompletion[]> => {
      const since = startOfISOWeek(subWeeks(new Date(), WEEKS_BACK - 1))
      const { data, error } = await supabase
        .from('nodes')
        .select('updated_at, status:statuses!nodes_status_id_fkey ( status_kind )')
        .eq('workspace_id', workspaceId)
        .eq('type', 'task')
        .gte('updated_at', since.toISOString())
        .limit(2000)
      if (error) throw error

      // Aproximación, no un dato exacto: no existe un timestamp de "cuándo
      // se completó" para una tarea de proyecto (a diferencia de
      // `completed_at`, que solo existe para tareas personales — 0015). Se
      // usa `updated_at` de las tareas que HOY están en un estado
      // `success` — funciona bien en la práctica porque una tarea rara vez
      // se toca después de terminada, pero reabrirla y volver a cerrarla,
      // o editar cualquier otro campo después, corre la fecha que se
      // muestra acá. Cerrar esto bien requeriría leer `activity_log` y
      // cruzar cada cambio de `status_id` contra el `status_kind` de cada
      // estado en cada proyecto — de más para un reporte "mínimo".
      const weeks: WeeklyCompletion[] = []
      for (let i = WEEKS_BACK - 1; i >= 0; i--) {
        const weekStart = startOfISOWeek(subWeeks(new Date(), i))
        weeks.push({
          weekStart: weekStart.toISOString(),
          label: formatDate(weekStart, 'd MMM', { locale: es }),
          count: 0,
        })
      }

      for (const row of data as unknown as RawWeeklyRow[]) {
        if (!isDoneStatus(row.status?.status_kind)) continue
        const bucketStart = startOfISOWeek(new Date(row.updated_at)).toISOString()
        const bucket = weeks.find((w) => w.weekStart === bucketStart)
        if (bucket) bucket.count += 1
      }
      return weeks
    },
    enabled: !!workspaceId,
  })

export function useWeeklyCompletions(workspaceId: string) {
  return useQuery(weeklyCompletionsQueryOptions(workspaceId))
}
