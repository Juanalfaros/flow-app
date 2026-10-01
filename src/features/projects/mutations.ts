import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  createProjectWithDefaults,
  createStatus,
  deleteProject,
  deleteProjectWithTasks,
  deleteStatus,
  moveProjectTasks,
  reorderStatuses,
  updateProjectDescription,
  updateProjectName,
  updateStatus,
} from '@/features/projects/api'
import {
  projectQueryOptions,
  projectsQueryOptions,
  statusesQueryOptions,
  type StatusSummary,
} from '@/features/projects/queries'
import { nodeTreeQueryOptions } from '@/features/nodes/queries'

type Status = StatusSummary

export function useCreateProjectMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (vars: { parentId: string; name: string }) =>
      createProjectWithDefaults(vars.parentId, vars.name),
    onSuccess: (projectId) => {
      // excepción aceptada a "no invalidar": creación de proyecto es un
      // evento de una sola vez, no un hot-path de UI. `node-tree` es la
      // que renderiza el árbol del Sidebar (ver src/features/nodes/queries.ts)
      // — sin invalidarla también, el proyecto nuevo no aparece hasta un
      // reload manual (bug real encontrado probando en navegador).
      queryClient.invalidateQueries({ queryKey: projectsQueryOptions(workspaceId).queryKey })
      queryClient.invalidateQueries({ queryKey: nodeTreeQueryOptions(workspaceId).queryKey })
      navigate({ to: '/p/$projectId/board', params: { projectId } })
    },
  })
}

export function useUpdateProjectMutation(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient()
  const key = projectQueryOptions(projectId).queryKey
  const listKey = projectsQueryOptions(workspaceId).queryKey
  // `node-tree` es la tercera copia del nombre: la que arma el árbol del
  // Sidebar, el breadcrumb y —desde el rediseño móvil— el título y el
  // "atrás" de la cabecera contextual (use-mobile-back.ts). Sin parchearla
  // acá, renombrar dejaba el nombre viejo arriba de la pantalla mientras
  // el resto de la app ya mostraba el nuevo.
  const treeKey = nodeTreeQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (name: string) => updateProjectName(projectId, name),
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: key })
      await queryClient.cancelQueries({ queryKey: listKey })
      await queryClient.cancelQueries({ queryKey: treeKey })
      const previous = queryClient.getQueryData(key)
      const previousList = queryClient.getQueryData(listKey)
      const previousTree = queryClient.getQueryData(treeKey)
      queryClient.setQueryData(key, (old) => (old ? { ...old, name } : old))
      // patch directo del cache hermano (home de proyectos) en vez de
      // invalidar — misma regla que el resto de las mutaciones de F1.
      queryClient.setQueryData<{ id: string; name: string }[]>(listKey, (old) =>
        old?.map((p) => (p.id === projectId ? { ...p, name } : p)) ?? [],
      )
      queryClient.setQueryData(treeKey, (old) =>
        old?.map((n) => (n.id === projectId ? { ...n, name } : n)),
      )
      return { previous, previousList, previousTree }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      if (ctx?.previousList) queryClient.setQueryData(listKey, ctx.previousList)
      if (ctx?.previousTree) queryClient.setQueryData(treeKey, ctx.previousTree)
    },
  })
}

// Igual patrón que useUpdateProjectMutation (patch optimista del cache de
// `project`), pero sin tocar `projectsQueryOptions`: la lista de
// proyectos (sidebar, Home) nunca muestra la descripción, no hace falta
// mantenerla sincronizada ahí.
export function useUpdateProjectDescriptionMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = projectQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (description: string) => updateProjectDescription(projectId, description),
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

export function useCreateStatusMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = statusesQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (vars: { name: string; statusKind: string }) => {
      const existing = queryClient.getQueryData<Status[]>(key) ?? []
      const position = existing.length
      return createStatus(projectId, vars.name, vars.statusKind, position)
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Status[]>(key, (old) => [...(old ?? []), created])
    },
  })
}

export function useUpdateStatusMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = statusesQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (vars: { statusId: string; fields: { name?: string; status_kind?: string } }) =>
      updateStatus(vars.statusId, vars.fields),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Status[]>(key)
      queryClient.setQueryData<Status[]>(key, (old) =>
        old?.map((s) => (s.id === vars.statusId ? { ...s, ...vars.fields } : s)) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useDeleteStatusMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = statusesQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (statusId: string) => deleteStatus(statusId),
    onMutate: async (statusId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Status[]>(key)
      queryClient.setQueryData<Status[]>(key, (old) => old?.filter((s) => s.id !== statusId) ?? [])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useMoveProjectTasksMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: { fromProjectId: string; toProjectId: string; toStatusId: string }) =>
      moveProjectTasks(vars.fromProjectId, vars.toProjectId, vars.toStatusId),
    onSuccess: (_data, vars) => {
      // evento de una sola vez (borrado de proyecto) — invalida en vez
      // de parchear el cache de tareas de ambos proyectos a mano.
      queryClient.invalidateQueries({ queryKey: ['tasks', vars.fromProjectId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', vars.toProjectId] })
    },
  })
}

export function useDeleteProjectMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const key = projectsQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: nodeTreeQueryOptions(workspaceId).queryKey })
      navigate({ to: '/' })
    },
  })
}

// Único camino soportado para "eliminar proyecto y sus tareas" (ver
// PLAN.md §4.2/§4.4) — `DeleteProjectDialog.tsx` la usa exclusivamente en
// la rama `target === DELETE_ALL && taskCount > 0`, nunca `useDeleteProjectMutation`
// llano para ese caso (el DELETE directo ya no cascadea tareas).
export function useDeleteProjectWithTasksMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const key = projectsQueryOptions(workspaceId).queryKey

  return useMutation({
    mutationFn: (projectId: string) => deleteProjectWithTasks(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: nodeTreeQueryOptions(workspaceId).queryKey })
      navigate({ to: '/' })
    },
  })
}

export function useReorderStatusesMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = statusesQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      reorderStatuses(orderedIds.map((id, position) => ({ id, position }))),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Status[]>(key)
      queryClient.setQueryData<Status[]>(key, (old) => {
        if (!old) return old
        const byId = new Map(old.map((s) => [s.id, s]))
        return orderedIds.map((id, position) => ({ ...byId.get(id)!, position }))
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}
