import { supabase } from '@/lib/supabase'

export async function createComment(
  taskId: string,
  authorId: string,
  body: string,
  mentionedUserIds: string[] = [],
  parentId: string | null = null,
) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ node_id: taskId, author_id: authorId, body, parent_id: parentId })
    .select(
      'id, node_id, author_id, body, created_at, parent_id, author:profiles!comments_author_id_fkey(id, full_name, avatar_url)',
    )
    .single()
  if (error) throw error

  if (mentionedUserIds.length) {
    // Sin RPC transaccional a propósito: si esto falla, el comentario ya
    // quedó posteado sin notificación — degradación aceptable, evita
    // over-engineering para una herramienta interna.
    await supabase.from('comment_mentions').insert(
      mentionedUserIds.map((mentioned_user_id) => ({ comment_id: data.id, mentioned_user_id })),
    )
  }

  return data
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
}
