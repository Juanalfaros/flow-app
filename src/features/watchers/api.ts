import { supabase } from '@/lib/supabase'

// Mismo patrón que src/features/assignees/api.ts / labels/api.ts.
export async function addTaskWatcher(taskId: string, userId: string) {
  const { error } = await supabase.from('task_watchers').insert({ node_id: taskId, user_id: userId })
  if (error) throw error
}

export async function removeTaskWatcher(taskId: string, userId: string) {
  const { error } = await supabase
    .from('task_watchers')
    .delete()
    .eq('node_id', taskId)
    .eq('user_id', userId)
  if (error) throw error
}
