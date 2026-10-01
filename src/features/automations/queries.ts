import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AutomationRuleRow } from '@/features/automations/api'

export const automationRulesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ['automation-rules', projectId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_rules')
        .select('id, project_id, kind, status_id, target_user_id, notify_whole_project, label_id, enabled, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as AutomationRuleRow[]
    },
    enabled: !!projectId,
  })

export function useAutomationRules(projectId: string) {
  return useQuery(automationRulesQueryOptions(projectId))
}
