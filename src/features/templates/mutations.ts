import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  saveTaskAsTemplate,
  instantiateTaskTemplate,
  saveProjectAsTemplate,
  instantiateProjectTemplate,
  renameTaskTemplate,
  deleteTaskTemplate,
  renameProjectTemplate,
  deleteProjectTemplate,
} from '@/features/templates/api'
import {
  taskTemplatesQueryOptions,
  projectTemplatesQueryOptions,
  type TaskTemplateSummary,
  type ProjectTemplateSummary,
} from '@/features/templates/queries'

export function useSaveTaskAsTemplateMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { taskId: string; name: string }) => saveTaskAsTemplate(vars.taskId, vars.name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskTemplatesQueryOptions(workspaceId).queryKey }),
  })
}

// Sin invalidación propia: quien llama (CreateTaskButton) ya invalida la
// lista de tareas del proyecto destino a través de su propio flujo
// habitual de creación — instanciar una plantilla, para el resto de la
// app, es "se creó una tarea" y nada más.
export function useInstantiateTaskTemplateMutation() {
  return useMutation({
    mutationFn: (vars: { templateId: string; containerId: string; statusId: string; position: number }) =>
      instantiateTaskTemplate(vars.templateId, vars.containerId, vars.statusId, vars.position),
  })
}

export function useSaveProjectAsTemplateMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; name: string }) => saveProjectAsTemplate(vars.projectId, vars.name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectTemplatesQueryOptions(workspaceId).queryKey }),
  })
}

export function useInstantiateProjectTemplateMutation() {
  return useMutation({
    mutationFn: (vars: { templateId: string; spaceId: string; name: string }) =>
      instantiateProjectTemplate(vars.templateId, vars.spaceId, vars.name),
  })
}

export function useRenameTaskTemplateMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = taskTemplatesQueryOptions(workspaceId).queryKey
  return useMutation({
    mutationFn: (vars: { templateId: string; name: string }) => renameTaskTemplate(vars.templateId, vars.name),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TaskTemplateSummary[]>(key)
      queryClient.setQueryData<TaskTemplateSummary[]>(
        key,
        (old) => old?.map((t) => (t.id === vars.templateId ? { ...t, name: vars.name } : t)) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useDeleteTaskTemplateMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = taskTemplatesQueryOptions(workspaceId).queryKey
  return useMutation({
    mutationFn: (templateId: string) => deleteTaskTemplate(templateId),
    onMutate: async (templateId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TaskTemplateSummary[]>(key)
      queryClient.setQueryData<TaskTemplateSummary[]>(key, (old) => old?.filter((t) => t.id !== templateId) ?? [])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useRenameProjectTemplateMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = projectTemplatesQueryOptions(workspaceId).queryKey
  return useMutation({
    mutationFn: (vars: { templateId: string; name: string }) => renameProjectTemplate(vars.templateId, vars.name),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ProjectTemplateSummary[]>(key)
      queryClient.setQueryData<ProjectTemplateSummary[]>(
        key,
        (old) => old?.map((t) => (t.id === vars.templateId ? { ...t, name: vars.name } : t)) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useDeleteProjectTemplateMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = projectTemplatesQueryOptions(workspaceId).queryKey
  return useMutation({
    mutationFn: (templateId: string) => deleteProjectTemplate(templateId),
    onMutate: async (templateId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ProjectTemplateSummary[]>(key)
      queryClient.setQueryData<ProjectTemplateSummary[]>(key, (old) => old?.filter((t) => t.id !== templateId) ?? [])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}
