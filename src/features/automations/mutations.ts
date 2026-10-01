import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createAutomationRule,
  deleteAutomationRule,
  setAutomationRuleEnabled,
  type AutomationRuleInsert,
} from '@/features/automations/api'
import { automationRulesQueryOptions } from '@/features/automations/queries'

export function useCreateAutomationRuleMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = automationRulesQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (rule: AutomationRuleInsert) => createAutomationRule(rule),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteAutomationRuleMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = automationRulesQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (id: string) => deleteAutomationRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useSetAutomationRuleEnabledMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = automationRulesQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) => setAutomationRuleEnabled(vars.id, vars.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
