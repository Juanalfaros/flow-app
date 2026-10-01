import { supabase } from '@/lib/supabase'

// Mismo patrón que src/features/labels/api.ts (addTaskLabel/removeTaskLabel):
// escritura directa a la tabla muchos-a-muchos, sin RPC — la validación de
// pertenencia al workspace vive en el `with check` de la RLS
// (task_assignees_access, 0041_task_assignees.sql).
export async function addTaskAssignee(taskId: string, userId: string) {
  const { error } = await supabase.from('task_assignees').insert({ node_id: taskId, user_id: userId })
  if (error) throw error
}

export async function removeTaskAssignee(taskId: string, userId: string) {
  const { error } = await supabase
    .from('task_assignees')
    .delete()
    .eq('node_id', taskId)
    .eq('user_id', userId)
  if (error) throw error
}
