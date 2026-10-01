import { supabase } from '@/lib/supabase'

// Calca favorites/api.ts — "Ocultar espacio" es el mismo patrón
// insert/delete por usuario, solo que en la tabla opuesta (ver
// 0060_hidden_nodes.sql).
export async function hideNode(userId: string, nodeId: string) {
  const { error } = await supabase.from('hidden_nodes').insert({ user_id: userId, node_id: nodeId })
  if (error) throw error
}

export async function unhideNode(userId: string, nodeId: string) {
  const { error } = await supabase.from('hidden_nodes').delete().eq('user_id', userId).eq('node_id', nodeId)
  if (error) throw error
}
