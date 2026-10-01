import { supabase } from '@/lib/supabase'

export async function createLabel(workspaceId: string, name: string, color: string) {
  const { data, error } = await supabase
    .from('labels')
    .insert({ workspace_id: workspaceId, name, color })
    .select('id, workspace_id, name, color')
    .single()
  if (error) throw error
  return data
}

export async function updateLabel(labelId: string, fields: { name?: string; color?: string | null }) {
  const { error } = await supabase.from('labels').update(fields).eq('id', labelId)
  if (error) throw error
}

export async function deleteLabel(labelId: string) {
  const { error } = await supabase.from('labels').delete().eq('id', labelId)
  if (error) throw error
}

export async function addTaskLabel(taskId: string, labelId: string) {
  const { error } = await supabase.from('task_labels').insert({ node_id: taskId, label_id: labelId })
  if (error) throw error
}

export async function removeTaskLabel(taskId: string, labelId: string) {
  const { error } = await supabase
    .from('task_labels')
    .delete()
    .eq('node_id', taskId)
    .eq('label_id', labelId)
  if (error) throw error
}
