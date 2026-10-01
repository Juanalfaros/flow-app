import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { ProfileSummary, TaskAssigneeSummary } from '@/features/tasks/queries'

// Rediseño de Inicio ("Resumen del día", mockup
// https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy) — queries nuevas para
// "Necesita tu acción". Ninguna requiere una migración: son variantes de
// consultas que ya existen en otras partes de la app (myTasksQueryOptions
// en features/tasks/queries.ts, task_reviewers ya usado por-tarea en
// features/reviewers, notifications ya usado por Bandeja).

export interface FocusTaskRow {
  id: string
  title: string
  due_date: string | null
  due_time: string | null
  completed_at: string | null
  priority: string
  status: Pick<Database['public']['Tables']['statuses']['Row'], 'id' | 'name' | 'status_kind'> | null
  projectId: string | null
  task_assignees: TaskAssigneeSummary[]
}

interface RawFocusTaskRow {
  id: string
  title: string
  due_date: string | null
  due_time: string | null
  completed_at: string | null
  priority: string
  status: Pick<Database['public']['Tables']['statuses']['Row'], 'id' | 'name' | 'status_kind'> | null
  memberships: { container_id: string }[]
  task_assignees: TaskAssigneeSummary[]
}

/**
 * Mis tareas abiertas, con lo que "Necesita tu acción" necesita y
 * `myTasksQueryOptions` (features/tasks/queries.ts) no trae: `due_time`
 * (para "Tu agenda", PR 2) y `task_assignees` completo (el mockup muestra
 * varios avatares por tarea, no solo el mío — `myTasksQueryOptions` es
 * "mis tareas", nunca necesitó a los demás). Consulta separada en vez de
 * sumarle estas columnas a esa: `myTasksQueryOptions` alimenta también
 * "Mi trabajo"/Reportes, que no las usan — pedirlas ahí sería peso muerto
 * en cachés que no las necesitan.
 */
export const myOpenTasksQueryOptions = (workspaceId: string, userId: string | undefined) =>
  queryOptions({
    queryKey: ['home-open-tasks', workspaceId, userId] as const,
    queryFn: async (): Promise<FocusTaskRow[]> => {
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `
          id, title, due_date, due_time, completed_at, priority,
          status:statuses!nodes_status_id_fkey ( id, name, status_kind ),
          memberships:node_memberships!node_memberships_node_id_fkey ( container_id ),
          task_assignees ( user_id, assignee:profiles!task_assignees_user_id_fkey ( id, full_name, avatar_url ) )
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('type', 'task')
        .eq('assignee_id', userId as string)
        .is('parent_id', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200)
      if (error) throw error
      return (data as unknown as RawFocusTaskRow[]).map(({ memberships, ...row }) => ({
        ...row,
        projectId: memberships[0]?.container_id ?? null,
      }))
    },
    enabled: !!workspaceId && !!userId,
  })

export function useMyOpenTasks(workspaceId: string, userId: string | undefined) {
  return useQuery(myOpenTasksQueryOptions(workspaceId, userId))
}

export interface PendingReviewRow {
  id: string
  created_at: string
  node: { id: string; title: string; priority: string; memberships: { container_id: string }[] } | null
}

/**
 * "Te piden revisión": mis filas en `task_reviewers` con `status='pending'`.
 * Antes esta tabla solo se consultaba por-tarea (features/reviewers/
 * queries.ts, dentro del detalle) — este es el primer query "para mí, a
 * través de todos mis proyectos". Sin nombre de quien pidió la revisión:
 * `task_reviewers` no guarda quién agregó al revisor (confirmado al
 * revisar el schema), así que se muestra desde cuándo espera en vez de
 * quién la pidió.
 */
export const pendingReviewsQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['home-pending-reviews', userId] as const,
    queryFn: async (): Promise<PendingReviewRow[]> => {
      const { data, error } = await supabase
        .from('task_reviewers')
        .select(
          `
          id, created_at,
          node:nodes ( id, title, priority, memberships:node_memberships!node_memberships_node_id_fkey ( container_id ) )
        `,
        )
        .eq('user_id', userId as string)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as PendingReviewRow[]
    },
    enabled: !!userId,
  })

export function usePendingReviews(userId: string | undefined) {
  return useQuery(pendingReviewsQueryOptions(userId))
}

export interface UnblockedRow {
  notificationId: string
  createdAt: string
  actor: ProfileSummary | null
  node: { id: string; title: string } | null
}

/**
 * "Ya puedes empezar": notificaciones `type='unblocked'` recientes
 * (notify_on_dependency_unblocked, 0045_dependency_gate.sql). Sin tabla
 * nueva — se deriva de `notifications` filtrando el tipo, igual que
 * Bandeja filtra `read_at`. Se cruza en el componente contra
 * `myOpenTasksQueryOptions` para no mostrar una tarea que ya se completó
 * o cuyo estado cambió desde el aviso.
 */
export const recentlyUnblockedQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['home-unblocked', userId] as const,
    queryFn: async (): Promise<UnblockedRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          `
          id, created_at,
          actor:profiles!notifications_actor_id_fkey ( id, full_name, avatar_url ),
          node:nodes ( id, title )
        `,
        )
        .eq('recipient_id', userId as string)
        .eq('type', 'unblocked')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data as unknown as { id: string; created_at: string; actor: ProfileSummary | null; node: { id: string; title: string } | null }[]).map(
        (row) => ({ notificationId: row.id, createdAt: row.created_at, actor: row.actor, node: row.node }),
      )
    },
    enabled: !!userId,
  })

export function useRecentlyUnblocked(userId: string | undefined) {
  return useQuery(recentlyUnblockedQueryOptions(userId))
}

export interface WeekMilestoneRow {
  id: string
  title: string
  due_date: string
  projectId: string | null
}

interface RawWeekMilestoneRow {
  id: string
  title: string
  due_date: string
  memberships: { container_id: string }[]
}

/**
 * Hitos de la semana para "Esta semana" — `nodes.is_milestone` en TODO el
 * workspace, no solo mis proyectos (el mockup muestra el hito de un
 * espacio donde la persona participa pero no es responsable de ese hito
 * puntual). Sin filtro extra de membresía: como el resto de las queries de
 * Inicio (`myOpenTasksQueryOptions`, `projectsQueryOptions`), se confía en
 * la RLS de `nodes` para que esto ya vuelva acotado a lo que la persona
 * puede ver.
 */
export const weekMilestonesQueryOptions = (workspaceId: string, startDate: string, endDate: string) =>
  queryOptions({
    queryKey: ['home-week-milestones', workspaceId, startDate, endDate] as const,
    queryFn: async (): Promise<WeekMilestoneRow[]> => {
      const { data, error } = await supabase
        .from('nodes')
        .select(
          `
          id, title, due_date,
          memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('type', 'task')
        .eq('is_milestone', true)
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .order('due_date', { ascending: true })
      if (error) throw error
      return (data as unknown as RawWeekMilestoneRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        due_date: row.due_date,
        projectId: row.memberships[0]?.container_id ?? null,
      }))
    },
    enabled: !!workspaceId,
  })

export function useWeekMilestones(workspaceId: string, startDate: string, endDate: string) {
  return useQuery(weekMilestonesQueryOptions(workspaceId, startDate, endDate))
}

export interface WeekTimeEntryRow {
  id: string
  minutes: number
  entry_date: string
  created_at: string
  node: { id: string; title: string } | null
}

/**
 * Mis registros de tiempo de la semana, para "Tu tiempo" — variante de
 * `timeEntriesQueryOptions` (features/time-tracking/queries.ts), que es
 * por TAREA (`node_id` fijo, para el popover del detalle). Acá la
 * pregunta es la inversa: todas MIS filas en un rango de fechas, sin
 * importar la tarea, así que la raíz es `user_id` en vez de `node_id`.
 */
export const weekTimeEntriesQueryOptions = (userId: string | undefined, startDate: string, endDate: string) =>
  queryOptions({
    queryKey: ['home-week-time', userId, startDate, endDate] as const,
    queryFn: async (): Promise<WeekTimeEntryRow[]> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('id, minutes, entry_date, created_at, node:nodes ( id, title )')
        .eq('user_id', userId as string)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as WeekTimeEntryRow[]
    },
    enabled: !!userId,
  })

export function useWeekTimeEntries(userId: string | undefined, startDate: string, endDate: string) {
  return useQuery(weekTimeEntriesQueryOptions(userId, startDate, endDate))
}
