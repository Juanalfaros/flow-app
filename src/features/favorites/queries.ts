import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { TaskLabelSummary } from '@/features/tasks/queries'

type StatusSummary = Pick<Database['public']['Tables']['statuses']['Row'], 'id' | 'name' | 'status_kind'>

export interface FavoriteNodeRow {
  node_id: string
  node: {
    id: string
    name: string
    type: string
    // Los siguientes 5 solo tienen sentido para `type='task'` (widget de
    // Prioridades) — quedan en `null`/`[]` para proyectos, sin usarse.
    priority: string
    due_date: string | null
    completed_at: string | null
    status: StatusSummary | null
    task_labels: { label: TaskLabelSummary }[]
    memberships: { container_id: string }[]
  }
}

// Una sola query/cache para AMBOS tipos de favorito (proyectos y tareas
// fijadas como prioridad) — `favorites` no distingue por `type` a nivel
// de esquema (ver migración 0013), y mantenerlo unificado evita que el
// toggle optimista de `useToggleFavoriteMutation` quede desincronizado
// entre dos caches separadas. Cada consumidor filtra client-side por
// `node.type` (mismo patrón de filtrado sobre selects embebidos que ya
// usa el resto del código, ver tasks/queries.ts).
export const favoritesQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['favorites', userId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('favorites')
        .select(
          `
          node_id,
          node:nodes (
            id, name:title, type, priority, due_date, completed_at,
            status:statuses!nodes_status_id_fkey ( id, name, status_kind ),
            task_labels ( label:labels ( id, name, color ) ),
            memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
          )
        `,
        )
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as FavoriteNodeRow[]
    },
    enabled: !!userId,
  })

export function useFavorites(userId: string | undefined) {
  return useQuery(favoritesQueryOptions(userId))
}

// S-15: antes solo `type === 'project'` — el sidebar filtraba afuera
// cualquier espacio/carpeta marcado favorito (el toggle en sí ya no
// distinguía por tipo, ver favorites/mutations.ts), así que "Favorito" en
// el menú de un espacio no tenía dónde aparecer una vez activado.
export function useFavoriteProjects(userId: string | undefined) {
  const { data, ...rest } = useFavorites(userId)
  return { ...rest, data: data?.filter((f) => f.node.type === 'project' || f.node.type === 'folder' || f.node.type === 'space') }
}

export function useTaskPriorities(userId: string | undefined) {
  const { data, ...rest } = useFavorites(userId)
  return { ...rest, data: data?.filter((f) => f.node.type === 'task') }
}

// Derivado del mismo cache que la lista completa — evita un round-trip
// aparte por cada FavoriteButton que se monta.
export function useIsFavorited(userId: string | undefined, nodeId: string) {
  const { data } = useFavorites(userId)
  return data?.some((f) => f.node_id === nodeId) ?? false
}
