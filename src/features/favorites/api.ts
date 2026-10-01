import { supabase } from '@/lib/supabase'

export async function addFavorite(userId: string, nodeId: string) {
  const { error } = await supabase.from('favorites').insert({ user_id: userId, node_id: nodeId })
  if (error) throw error
}

export async function removeFavorite(userId: string, nodeId: string) {
  const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('node_id', nodeId)
  if (error) throw error
}
