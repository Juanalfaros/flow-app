import { supabase } from '@/lib/supabase'

// Asignar/quitar revisor: escritura directa (mismo patrón que
// assignees/watchers). Decidir NO es un update directo — ver
// decideTaskReview, que pasa por la RPC decide_task_review (0046): un
// revisor solo puede tocar su propia fila.
export async function addTaskReviewer(taskId: string, userId: string) {
  const { error } = await supabase.from('task_reviewers').insert({ node_id: taskId, user_id: userId })
  if (error) throw error
}

export async function removeTaskReviewer(taskId: string, userId: string) {
  const { error } = await supabase
    .from('task_reviewers')
    .delete()
    .eq('node_id', taskId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function decideTaskReview(taskId: string, approved: boolean) {
  const { error } = await supabase.rpc('decide_task_review', { p_node_id: taskId, p_approved: approved })
  if (error) throw error
}
