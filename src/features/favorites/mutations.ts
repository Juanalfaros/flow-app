import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addFavorite, removeFavorite } from '@/features/favorites/api'
import { favoritesQueryOptions, type FavoriteNodeRow } from '@/features/favorites/queries'

export function useToggleFavoriteMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  const key = favoritesQueryOptions(userId).queryKey

  return useMutation({
    mutationFn: (vars: { nodeId: string; nodeName: string; nodeType: string; isFavorited: boolean }) => {
      if (!userId) throw new Error('No hay sesión activa')
      return vars.isFavorited ? removeFavorite(userId, vars.nodeId) : addFavorite(userId, vars.nodeId)
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<FavoriteNodeRow[]>(key)
      queryClient.setQueryData<FavoriteNodeRow[]>(key, (old) =>
        vars.isFavorited
          ? (old ?? []).filter((f) => f.node_id !== vars.nodeId)
          : [
              {
                node_id: vars.nodeId,
                node: {
                  id: vars.nodeId,
                  name: vars.nodeName,
                  type: vars.nodeType,
                  priority: 'medium',
                  due_date: null,
                  completed_at: null,
                  status: null,
                  task_labels: [],
                  memberships: [],
                },
              },
              ...(old ?? []),
            ],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    // El insert optimista de arriba solo alcanza para que el ⭐ refleje
    // el estado al toque — le faltan los campos reales (priority,
    // due_date, status, labels) que sí necesita el widget de Prioridades.
    // Se corrige solo con el refetch de acá, no hacía falta antes porque
    // ningún consumidor leía más que id/name.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
