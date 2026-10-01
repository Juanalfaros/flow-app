import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addTaskAssignee, removeTaskAssignee } from '@/features/assignees/api'
import {
  taskDetailQueryOptions,
  tasksListKeyPrefix,
  type TaskAssigneeSummary,
  type TaskSummary,
} from '@/features/tasks/queries'

// Clon de useToggleTaskLabelMutation (src/features/labels/mutations.ts):
// mismo parche optimista de la cache de lista (por prefijo, no por key
// exacta — ver el comentario de tasksListKeyPrefix sobre includeDescription)
// y de la cache de detalle, con rollback en onError. Solo para tareas de
// proyecto (varios asignados posibles) — las subtareas ya no pasan por
// acá: tienen un único responsable (nodes.assignee_id), ver
// useSetSubtaskAssigneeMutation en tasks/mutations.ts.
export function useToggleTaskAssigneeMutation(projectId: string) {
  const queryClient = useQueryClient()
  const listKeyPrefix = tasksListKeyPrefix(projectId)

  return useMutation({
    mutationFn: (vars: { taskId: string; member: TaskAssigneeSummary; assigned: boolean }) =>
      vars.assigned
        ? removeTaskAssignee(vars.taskId, vars.member.user_id)
        : addTaskAssignee(vars.taskId, vars.member.user_id),
    onMutate: async (vars) => {
      const detailKey = taskDetailQueryOptions(vars.taskId).queryKey
      await queryClient.cancelQueries({ queryKey: listKeyPrefix })
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previousLists = queryClient.getQueriesData<TaskSummary[]>({ queryKey: listKeyPrefix })
      const previousDetail = queryClient.getQueryData(detailKey)

      const patchAssignees = (task_assignees: TaskAssigneeSummary[]) =>
        vars.assigned
          ? task_assignees.filter((a) => a.user_id !== vars.member.user_id)
          : [...task_assignees, vars.member]

      queryClient.setQueriesData<TaskSummary[]>({ queryKey: listKeyPrefix }, (old) =>
        old?.map((t) => (t.id === vars.taskId ? { ...t, task_assignees: patchAssignees(t.task_assignees) } : t)) ?? [],
      )
      queryClient.setQueryData(detailKey, (old) =>
        old ? { ...old, task_assignees: patchAssignees(old.task_assignees) } : old,
      )
      return { previousLists, previousDetail, detailKey }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (ctx?.previousDetail) queryClient.setQueryData(ctx.detailKey, ctx.previousDetail)
    },
  })
}

// Reemplaza el viejo bulk-assign de SelectionActionBar, que escribía el
// escalar `assignee_id` vía `useBulkUpdateTasksMutation` mientras
// avatares/filtro ya leían `task_assignees` — el trigger de sync de
// 0041_task_assignees.sql solo va de `assignee_id` hacia la tabla, nunca
// al revés, así que "Sin asignar" no borraba nada y "Asignar a X" quedaba
// indistinguible de "sumar a X" (B-02). Acá la acción es explícita
// (agregar o quitar), no un toggle por tarea — cada tarea seleccionada
// puede tener a esa persona asignada o no de antemano, y "Agregar
// responsable" debe dejarla asignada en las N, no alternar. Sin parche
// optimista (a diferencia de useToggleTaskAssigneeMutation): son N
// escrituras en paralelo sobre tareas arbitrarias, más simple invalidar
// al terminar, mismo criterio que useBulkUpdateTasksMutation.
export function useBulkAssignMutation(projectId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(projectId)

  return useMutation({
    mutationFn: async (vars: { taskIds: string[]; userId: string; action: 'add' | 'remove' }) => {
      const fn = vars.action === 'add' ? addTaskAssignee : removeTaskAssignee
      await Promise.all(vars.taskIds.map((taskId) => fn(taskId, vars.userId)))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyPrefix }),
    onError: () => queryClient.invalidateQueries({ queryKey: keyPrefix }),
  })
}
