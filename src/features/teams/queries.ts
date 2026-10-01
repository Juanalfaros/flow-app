import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import { useWorkloadByPerson } from '@/features/reports/queries'

type TeamRow = Database['public']['Tables']['teams']['Row']

export type TeamSummary = Pick<
  TeamRow,
  'id' | 'workspace_id' | 'name' | 'handle' | 'description' | 'color' | 'created_at'
> & {
  members: { user_id: string; profile: TeamMemberProfile | null }[]
}

export type TeamMemberProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'avatar_url' | 'job_title'
>

// Una sola query trae los equipos CON sus miembros y el perfil de cada uno.
// La alternativa —listar equipos y después pedir los miembros de cada uno— es
// el N+1 clásico: con 5 equipos son 6 round-trips en vez de 1, y en un tier
// gratuito el presupuesto que importa es el de requests, no el de CPU.
export const teamsQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['teams', workspaceId] as const,
    queryFn: async (): Promise<TeamSummary[]> => {
      const { data, error } = await supabase
        .from('teams')
        .select(
          `
          id, workspace_id, name, handle, description, color, created_at,
          members:team_members ( user_id, profile:profiles ( id, full_name, avatar_url, job_title ) )
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw error
      return data as unknown as TeamSummary[]
    },
    enabled: !!workspaceId,
  })

export function useTeams(workspaceId: string) {
  return useQuery(teamsQueryOptions(workspaceId))
}

export const teamQueryOptions = (teamId: string) =>
  queryOptions({
    queryKey: ['team', teamId] as const,
    queryFn: async (): Promise<TeamSummary> => {
      const { data, error } = await supabase
        .from('teams')
        .select(
          `
          id, workspace_id, name, handle, description, color, created_at,
          members:team_members ( user_id, profile:profiles ( id, full_name, avatar_url, job_title ) )
        `,
        )
        .eq('id', teamId)
        .single()
      if (error) throw error
      return data as unknown as TeamSummary
    },
    enabled: !!teamId,
  })

export function useTeam(teamId: string) {
  return useQuery(teamQueryOptions(teamId))
}

/**
 * Equipos a los que pertenece cada persona, indexados por `user_id`.
 *
 * Se deriva del mismo cache que la lista completa en vez de pedir otra query:
 * la ficha de persona necesita "Brand, Audiovisual" y esa información ya vino
 * en `teamsQueryOptions`. Mismo criterio que `useIsFavorited` sobre
 * `useFavorites` (features/favorites/queries.ts).
 */
export function useTeamsByUser(workspaceId: string) {
  const { data: teams, ...rest } = useTeams(workspaceId)
  const byUser = new Map<string, TeamSummary[]>()
  for (const team of teams ?? []) {
    for (const m of team.members) {
      const list = byUser.get(m.user_id)
      if (list) list.push(team)
      else byUser.set(m.user_id, [team])
    }
  }
  return { ...rest, data: byUser }
}

export interface TeamWorkload {
  teamId: string
  openCount: number
  overdueCount: number
  /** Listas donde algún integrante del equipo tiene al menos una tarea
   * abierta asignada (unión de `projectIds` por persona, no suma — dos
   * integrantes en la misma lista cuentan una vez). `projectCount` es
   * solo el tamaño, para la tarjeta de Equipos; `projectIds` es la lista
   * completa, para la ficha (TeamPanel.tsx) que sí necesita mostrar
   * cuáles. */
  projectCount: number
  projectIds: string[]
}

/**
 * Carga por equipo, derivada de `useWorkloadByPerson` sumando por
 * integrante (`team_members`) — rediseño de Equipo (2026-09-24, "una
 * query nueva, y solo una"). Sin esto habría que repetir la misma
 * consulta de `task_assignees` agrupada por equipo en vez de por
 * persona; en cambio se reusa el mismo resultado que ya piden las filas
 * de Personas, sumado acá en el cliente.
 */
export function useTeamWorkload(workspaceId: string) {
  const { data: teams } = useTeams(workspaceId)
  const { data: workload } = useWorkloadByPerson(workspaceId)
  const byUser = new Map((workload ?? []).map((w) => [w.userId, w]))

  const byTeam = new Map<string, TeamWorkload>()
  for (const team of teams ?? []) {
    let openCount = 0
    let overdueCount = 0
    const projectIds = new Set<string>()
    for (const member of team.members) {
      const personWorkload = byUser.get(member.user_id)
      if (!personWorkload) continue
      openCount += personWorkload.openCount
      overdueCount += personWorkload.overdueCount
      for (const projectId of personWorkload.projectIds) projectIds.add(projectId)
    }
    byTeam.set(team.id, { teamId: team.id, openCount, overdueCount, projectCount: projectIds.size, projectIds: [...projectIds] })
  }
  return byTeam
}
