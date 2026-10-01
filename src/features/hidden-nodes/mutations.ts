import { useMutation, useQueryClient } from '@tanstack/react-query'
import { hideNode, unhideNode } from '@/features/hidden-nodes/api'
import { hiddenNodesQueryOptions, type HiddenNodeRow } from '@/features/hidden-nodes/queries'

// Optimista (mismo molde que useToggleFavoriteMutation, favorites/mutations.ts):
// sin esto, ocultar/restaurar un espacio tarda un round-trip completo en
// desaparecer/reaparecer del sidebar (Sidebar.tsx filtra el árbol por
// useHiddenNodeIds, que lee de esta misma caché). nodeName/nodeType son
// opcionales porque unhide (desde "Espacios ocultos", que ya tiene la fila
// completa) no los necesita — solo hide (desde NodeTreeItem) arma una fila
// nueva y sí.
export function useToggleHiddenNodeMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  const key = hiddenNodesQueryOptions(userId).queryKey

  return useMutation({
    mutationFn: (vars: { nodeId: string; isHidden: boolean; nodeName?: string; nodeType?: string }) => {
      if (!userId) throw new Error('No hay sesión activa')
      return vars.isHidden ? unhideNode(userId, vars.nodeId) : hideNode(userId, vars.nodeId)
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<HiddenNodeRow[]>(key)
      queryClient.setQueryData<HiddenNodeRow[]>(key, (old) =>
        vars.isHidden
          ? (old ?? []).filter((h) => h.node_id !== vars.nodeId)
          : [
              {
                node_id: vars.nodeId,
                node: { id: vars.nodeId, name: vars.nodeName ?? '', type: vars.nodeType ?? 'space' },
              },
              ...(old ?? []),
            ],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
