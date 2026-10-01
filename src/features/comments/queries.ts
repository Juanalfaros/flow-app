import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export interface CommentSummary {
  id: string
  node_id: string
  author_id: string
  body: string
  created_at: string
  // F5 #5 (0055_comment_threading.sql): null = comentario raíz. La lista
  // sigue llegando plana (mismo `select` de siempre) — el árbol se arma
  // client-side, ver build-comment-tree.ts.
  parent_id: string | null
  author: Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'avatar_url'> | null
}

export const commentsQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: ['comments', taskId] as const,
    queryFn: async (): Promise<CommentSummary[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select(
          'id, node_id, author_id, body, created_at, parent_id, author:profiles!comments_author_id_fkey(id, full_name, avatar_url)',
        )
        .eq('node_id', taskId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!taskId,
  })

export function useComments(taskId: string) {
  return useQuery(commentsQueryOptions(taskId))
}

export type PersonComment = CommentSummary & {
  node: { id: string; title: string; memberships: { container_id: string }[] } | null
}

/**
 * Comentarios escritos por una persona, para su ficha.
 *
 * Embebe el nodo comentado para poder enlazar cada uno: sin eso la lista sería
 * un muro de texto sin contexto de a qué tarea pertenece cada comentario.
 *
 * No hace falta filtrar por workspace: la RLS de `comments` ya solo devuelve
 * los de nodos accesibles para quien consulta (0008 §13), así que pedir por
 * `author_id` no puede traer comentarios de otro workspace.
 */
export const personCommentsQueryOptions = (userId: string, limit = 30) =>
  queryOptions({
    queryKey: ['comments', 'person', userId, limit] as const,
    queryFn: async (): Promise<PersonComment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select(
          `
          id, node_id, author_id, body, created_at,
          author:profiles!comments_author_id_fkey(id, full_name, avatar_url),
          node:nodes ( id, title, memberships:node_memberships!node_memberships_node_id_fkey ( container_id ) )
        `,
        )
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as unknown as PersonComment[]
    },
    enabled: !!userId,
  })
