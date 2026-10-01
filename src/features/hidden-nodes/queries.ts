import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface HiddenNodeRow {
  node_id: string
  node: { id: string; name: string; type: string } | null
}

// Trae también nombre/tipo del nodo (no solo el id): la lista "Espacios
// ocultos" del footer del sidebar los necesita para poder restaurarlos
// sin una query aparte por fila.
export const hiddenNodesQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['hidden-nodes', userId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hidden_nodes')
        .select('node_id, node:nodes ( id, name:title, type )')
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as HiddenNodeRow[]
    },
    enabled: !!userId,
  })

export function useHiddenNodes(userId: string | undefined) {
  return useQuery(hiddenNodesQueryOptions(userId))
}

// El árbol del sidebar (nodeTreeQueryOptions, cacheado por workspace, no
// por usuario) no puede filtrar server-side por "ocultos de este
// usuario" — este hook da el Set de ids para filtrar client-side antes de
// buildHierarchy(), ver Sidebar.tsx.
export function useHiddenNodeIds(userId: string | undefined): Set<string> {
  const { data } = useHiddenNodes(userId)
  return new Set(data?.map((h) => h.node_id) ?? [])
}
