import { supabase } from '@/lib/supabase'

// Fire-and-forget desde NodeDetailContent — best-effort, no debe romper
// la vista de detalle si falla (ver el catch silencioso en el caller).
export async function recordView(userId: string, nodeId: string) {
  const { error } = await supabase
    .from('recent_views')
    .upsert({ user_id: userId, node_id: nodeId, viewed_at: new Date().toISOString() }, { onConflict: 'user_id,node_id' })
  if (error) throw error
}
