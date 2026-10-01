import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Tipos y query de la función get_report_data (0091_report_data.sql) —
// rediseño de /reportes, mockup:
// https://claude.ai/artifact/UtZT4mb5RAYrGzuYCqbNLU. Reemplaza las tres
// queries client-side de queries.ts para la PÁGINA de reportes; esas se
// quedan tal cual porque Equipo (useTeamWorkload) sigue leyendo
// workloadByPersonQueryOptions.

export type ReportPeriod = 'semana' | 'mes' | 'trimestre'

export interface ReportFilters {
  period: ReportPeriod
  spaceId: string | null
  teamId: string | null
  userId: string | null
  includeSubtasks: boolean
}

export const DEFAULT_REPORT_FILTERS: ReportFilters = {
  period: 'semana',
  spaceId: null,
  teamId: null,
  userId: null,
  includeSubtasks: false,
}

export interface ReportKpis {
  open: number
  openDelta: number
  done: number
  doneDelta: number
  overdue: number
  overdueDelta: number
  ontimePct: number
  cycleDays: number
  hours: number
  hoursDelta: number
}

export interface AttentionOverdueItem {
  id: string
  title: string
  projectTitle: string | null
  spaceTitle: string | null
  dueDate: string
  assignees: string | null
}

export interface AttentionAwayItem {
  id: string
  title: string
  projectTitle: string | null
  spaceTitle: string | null
  dueDate: string
  assigneeName: string
  startsOn: string
  endsOn: string
}

export interface AttentionBlockedItem {
  id: string
  title: string
  projectTitle: string | null
  predTitle: string
  predStatusKind: string
}

export interface AttentionReviewItem {
  id: string
  title: string
  reviewSince: string
  reviewerName: string
}

export interface AttentionUnassignedItem {
  id: string
  title: string
  projectTitle: string | null
  spaceTitle: string | null
  dueDate: string | null
}

export interface ReportAttention {
  overdue7: AttentionOverdueItem[]
  away: AttentionAwayItem[]
  blocked: AttentionBlockedItem[]
  reviews: AttentionReviewItem[]
  unassigned: AttentionUnassignedItem[]
}

export interface PortfolioMilestone {
  title: string
  dueDate: string
  overdue: boolean
}

export interface PortfolioEntry {
  projectId: string
  spaceId: string
  title: string
  stSuccess: number
  stWarning: number
  stDanger: number
  stNeutral: number
  stDropped: number
  openCount: number
  overdueCount: number
  ontimePct: number | null
  ontimeCount: number
  closedWithDueCount: number
  hours: number
  nextMilestone: PortfolioMilestone | null
  weekly: number[]
}

export interface ReportSpace {
  id: string
  title: string
}

export interface ReportMilestone {
  id: string
  title: string
  dueDate: string
  projectTitle: string | null
  spaceTitle: string | null
  predTotal: number
  predDone: number
}

export interface PersonAway {
  kind: string
  startsOn: string
  endsOn: string
}

export interface PersonReportRow {
  userId: string
  fullName: string | null
  avatarUrl: string | null
  urgent: number
  high: number
  medium: number
  low: number
  overdueCount: number
  dueSoonCount: number
  hours: number
  reviewCount: number
  away: PersonAway | null
}

export interface ReportDistributions {
  priority: Record<string, number>
  label: { name: string; n: number }[]
  labelNone: number
  fieldName: string | null
  field: { label: string; n: number }[]
}

export interface FlowWeek {
  weekStart: string
  created: number
  completed: number
}

export interface HoursBySpace {
  spaceId: string
  spaceTitle: string
  weekly: number[]
}

export interface ReportData {
  kpis: ReportKpis
  attention: ReportAttention
  portfolio: PortfolioEntry[]
  spaces: ReportSpace[]
  flow: FlowWeek[]
  hoursBySpace: HoursBySpace[]
  milestones: ReportMilestone[]
  people: PersonReportRow[]
  distributions: ReportDistributions
}

export const reportDataQueryOptions = (workspaceId: string, filters: ReportFilters) =>
  queryOptions({
    queryKey: ['reports', 'data', workspaceId, filters] as const,
    queryFn: async (): Promise<ReportData> => {
      const { data, error } = await supabase.rpc('get_report_data', {
        p_workspace_id: workspaceId,
        p_period: filters.period,
        p_space_id: filters.spaceId ?? undefined,
        p_team_id: filters.teamId ?? undefined,
        p_user_id: filters.userId ?? undefined,
        p_include_subtasks: filters.includeSubtasks,
      })
      if (error) throw error
      return data as unknown as ReportData
    },
    enabled: !!workspaceId,
  })

export function useReportData(workspaceId: string, filters: ReportFilters) {
  return useQuery(reportDataQueryOptions(workspaceId, filters))
}
