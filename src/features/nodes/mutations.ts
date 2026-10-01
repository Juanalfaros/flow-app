import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  archiveNode,
  createFolder,
  createSpace,
  deleteFolderWithContents,
  duplicateSpace,
  moveNode,
  renameFolder,
  unarchiveNode,
  updateNodeAppearance,
  updateNodeDescription,
  uploadNodeIcon,
} from '@/features/nodes/api'
import {
  archivedNodesQueryOptions,
  nodeDetailQueryOptions,
  nodeTreeQueryOptions,
  type TreeNodeRow,
} from '@/features/nodes/queries'
import { projectsQueryOptions } from '@/features/projects/queries'
import type { NodeAppearance } from '@/features/nodes/types'

// Mismo patrón que useUpdateProjectDescriptionMutation (features/projects/
// mutations.ts), generalizado a cualquier nodo — folder/space también
// tienen `description`, no solo project.
export function useUpdateNodeDescriptionMutation(nodeId: string) {
  const queryClient = useQueryClient()
  const key = nodeDetailQueryOptions(nodeId).queryKey

  return useMutation({
    mutationFn: (description: string) => updateNodeDescription(nodeId, description),
    onMutate: async (description) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (old) => (old ? { ...old, description } : old))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useCreateFolderMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { parentId: string; title: string }) =>
      createFolder(workspaceId, vars.parentId, vars.title),
    onSuccess: (created) => {
      queryClient.setQueryData<TreeNodeRow[]>(key, (old) => [...(old ?? []), created])
    },
  })
}

// F-01: mismo patrón que useCreateFolderMutation.
export function useCreateSpaceMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { title: string }) => createSpace(workspaceId, vars.title),
    onSuccess: (created) => {
      queryClient.setQueryData<TreeNodeRow[]>(key, (old) => [...(old ?? []), created])
    },
  })
}

export function useRenameFolderMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { folderId: string; title: string }) => renameFolder(vars.folderId, vars.title),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TreeNodeRow[]>(key)
      queryClient.setQueryData<TreeNodeRow[]>(key, (old) =>
        old?.map((n) => (n.id === vars.folderId ? { ...n, name: vars.title } : n)) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useDeleteFolderMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (folderId: string) => deleteFolderWithContents(folderId),
    onSuccess: () => {
      // evento de una sola vez, y el server borra un subárbol completo
      // (tamaño desconocido del lado del cliente sin recorrer el árbol) —
      // se invalida en vez de parchear el cache a mano, misma excepción
      // que ya usa useDeleteProjectWithTasksMutation.
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

// Igual criterio invalidate-only que useDeleteFolderMutation: archive_node
// toca un subárbol de tamaño desconocido del lado del cliente.
export function useArchiveNodeMutation(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (nodeId: string) => archiveNode(nodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTreeQueryOptions(workspaceId).queryKey })
      queryClient.invalidateQueries({ queryKey: archivedNodesQueryOptions(workspaceId).queryKey })
      // Generalizado a carpetas/listas (antes solo espacios): una lista
      // archivada tiene que desaparecer también de `useProjects` — la
      // consulta detrás de Tabla/Calendario/Timeline globales, el Command
      // Palette y los widgets de home, no solo del árbol del sidebar.
      queryClient.invalidateQueries({ queryKey: projectsQueryOptions(workspaceId).queryKey })
    },
  })
}

export function useUnarchiveNodeMutation(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (nodeId: string) => unarchiveNode(nodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTreeQueryOptions(workspaceId).queryKey })
      queryClient.invalidateQueries({ queryKey: archivedNodesQueryOptions(workspaceId).queryKey })
      queryClient.invalidateQueries({ queryKey: projectsQueryOptions(workspaceId).queryKey })
    },
  })
}

// Invalidate-only, mismo criterio que useDeleteFolderMutation: el server
// crea un subárbol completo de tamaño desconocido del lado del cliente.
export function useDuplicateSpaceMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { spaceId: string; newName: string }) => duplicateSpace(vars.spaceId, vars.newName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useUpdateNodeAppearanceMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { nodeId: string; appearance: NodeAppearance }) =>
      updateNodeAppearance(vars.nodeId, vars.appearance),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TreeNodeRow[]>(key)
      queryClient.setQueryData<TreeNodeRow[]>(key, (old) =>
        old?.map((n) => (n.id === vars.nodeId ? { ...n, custom_fields: { appearance: vars.appearance } } : n)) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useUploadNodeIconMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { nodeId: string; file: File }) => uploadNodeIcon(vars.nodeId, vars.file),
    onSuccess: (imageUrl, vars) => {
      queryClient.setQueryData<TreeNodeRow[]>(key, (old) =>
        old?.map((n) =>
          n.id === vars.nodeId ? { ...n, custom_fields: { appearance: { kind: 'image', imageUrl } } } : n,
        ) ?? [],
      )
    },
  })
}

export function useMoveNodeMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (vars: { nodeId: string; newParentId: string }) => moveNode(vars.nodeId, vars.newParentId),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TreeNodeRow[]>(key)
      queryClient.setQueryData<TreeNodeRow[]>(key, (old) =>
        old?.map((n) => (n.id === vars.nodeId ? { ...n, parent_id: vars.newParentId } : n)) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}
