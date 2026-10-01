import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type AutomationRuleRow = Database['public']['Tables']['automation_rules']['Row']
export type AutomationRuleInsert = Database['public']['Tables']['automation_rules']['Insert']

export async function createAutomationRule(rule: AutomationRuleInsert) {
  const { data, error } = await supabase.from('automation_rules').insert(rule).select().single()
  if (error) throw error
  return data as AutomationRuleRow
}

export async function deleteAutomationRule(id: string) {
  const { error } = await supabase.from('automation_rules').delete().eq('id', id)
  if (error) throw error
}

export async function setAutomationRuleEnabled(id: string, enabled: boolean) {
  const { error } = await supabase.from('automation_rules').update({ enabled }).eq('id', id)
  if (error) throw error
}
