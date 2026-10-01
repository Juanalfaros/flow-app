import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCustomField,
  deleteCustomField,
  deleteCustomFieldValue,
  updateCustomField,
  upsertCustomFieldValue,
} from '@/features/custom-fields/api'
import {
  projectCustomFieldsQueryOptions,
  taskCustomFieldValuesQueryOptions,
  type CustomFieldDefinition,
  type CustomFieldOption,
  type CustomFieldType,
  type TaskCustomFieldValueRow,
  type ProjectTaskCustomFieldValueRow,
} from '@/features/custom-fields/queries'
import type { Json } from '@/features/nodes/types'

export function useCreateCustomFieldMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = projectCustomFieldsQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (vars: { name: string; fieldType: CustomFieldType; options?: CustomFieldOption[] | null }) => {
      const existing = queryClient.getQueryData<CustomFieldDefinition[]>(key) ?? []
      const position = (existing.at(-1)?.position ?? 0) + 1
      return createCustomField(projectId, { ...vars, position })
    },
    onSuccess: (created) => {
      queryClient.setQueryData<CustomFieldDefinition[]>(key, (old) => [...(old ?? []), created])
    },
  })
}

export function useUpdateCustomFieldMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = projectCustomFieldsQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (vars: { fieldId: string; fields: { name?: string; options?: CustomFieldOption[] | null } }) =>
      updateCustomField(vars.fieldId, vars.fields),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CustomFieldDefinition[]>(key)
      queryClient.setQueryData<CustomFieldDefinition[]>(key, (old) =>
        old?.map((f) => (f.id === vars.fieldId ? { ...f, ...vars.fields } : f)) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

export function useDeleteCustomFieldMutation(projectId: string) {
  const queryClient = useQueryClient()
  const key = projectCustomFieldsQueryOptions(projectId).queryKey

  return useMutation({
    mutationFn: (fieldId: string) => deleteCustomField(fieldId),
    onMutate: async (fieldId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CustomFieldDefinition[]>(key)
      queryClient.setQueryData<CustomFieldDefinition[]>(key, (old) => old?.filter((f) => f.id !== fieldId) ?? [])
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

// `projectId` opcional: solo lo pasa TableView.tsx (F5 #4), que además del
// cache por tarea (`taskCustomFieldValuesQueryOptions`, el que ya leía el
// panel de detalle) necesita parchear el cache BATCHEADO de la grilla
// (`projectTaskCustomFieldValuesQueryOptions`) — si no, editar una celda
// ahí quedaría desincronizado hasta el próximo refetch manual. Se usa
// `setQueriesData` con prefijo (sin el array `taskIds` completo en la key,
// que la mutation no tiene por qué conocer) — mismo patrón que
// `patchListCache` en offline-queue.ts.
export function useUpsertCustomFieldValueMutation(taskId: string, projectId?: string) {
  const queryClient = useQueryClient()
  const key = taskCustomFieldValuesQueryOptions(taskId).queryKey

  return useMutation({
    mutationFn: (vars: { fieldId: string; value: Json | null }) =>
      vars.value === null
        ? deleteCustomFieldValue(taskId, vars.fieldId)
        : upsertCustomFieldValue(taskId, vars.fieldId, vars.value),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TaskCustomFieldValueRow[]>(key)
      queryClient.setQueryData<TaskCustomFieldValueRow[]>(key, (old) => {
        const rest = (old ?? []).filter((v) => v.field_id !== vars.fieldId)
        return vars.value === null ? rest : [...rest, { field_id: vars.fieldId, value: vars.value }]
      })

      if (projectId) {
        queryClient.setQueriesData<ProjectTaskCustomFieldValueRow[]>(
          { queryKey: ['project-task-custom-field-values', projectId] },
          (old) => {
            const rest = (old ?? []).filter((v) => !(v.node_id === taskId && v.field_id === vars.fieldId))
            return vars.value === null ? rest : [...rest, { node_id: taskId, field_id: vars.fieldId, value: vars.value }]
          },
        )
      }

      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
  })
}

// Arrastrar una tarjeta entre columnas del Board/secciones de Lista cuando
// "Agrupar por" está en un campo personalizado (useNodeViewController.ts).
// A diferencia de useUpsertCustomFieldValueMutation de arriba, acá `taskId`
// viaja en cada `mutate()` en vez de fijarse al montar el hook — el drag
// puede soltar CUALQUIER tarjeta visible, no una tarea fija conocida de
// antemano (mismo motivo por el que useMoveTaskMutation toma `taskId` como
// variable). Solo parchea el cache BATCHEADO
// (`projectTaskCustomFieldValuesQueryOptions`, lo que en verdad lee Board/
// Lista al agrupar) — el cache por-tarea (`taskCustomFieldValuesQueryOptions`)
// lo deja para el próximo fetch si el panel de detalle de esa tarea está
// abierto, no vale la pena escribirlo a ciegas para una tarjeta que quizás
// nunca se abra.
export function useSetAnyTaskCustomFieldValueMutation(projectId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = ['project-task-custom-field-values', projectId]

  return useMutation({
    mutationFn: (vars: { taskId: string; fieldId: string; value: Json | null }) =>
      vars.value === null
        ? deleteCustomFieldValue(vars.taskId, vars.fieldId)
        : upsertCustomFieldValue(vars.taskId, vars.fieldId, vars.value),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: keyPrefix })
      const previous = queryClient.getQueriesData<ProjectTaskCustomFieldValueRow[]>({ queryKey: keyPrefix })
      queryClient.setQueriesData<ProjectTaskCustomFieldValueRow[]>({ queryKey: keyPrefix }, (old) => {
        const rest = (old ?? []).filter((v) => !(v.node_id === vars.taskId && v.field_id === vars.fieldId))
        return vars.value === null ? rest : [...rest, { node_id: vars.taskId, field_id: vars.fieldId, value: vars.value }]
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
  })
}
