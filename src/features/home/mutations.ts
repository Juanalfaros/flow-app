import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { updateTaskFields } from '@/features/tasks/api'
import { delegatedTasksQueryOptions, myTasksQueryOptions, tasksListKeyPrefix } from '@/features/tasks/queries'
import { statusesQueryOptions } from '@/features/projects/queries'
import { decideTaskReview } from '@/features/reviewers/api'
import { myOpenTasksQueryOptions, pendingReviewsQueryOptions, type FocusTaskRow } from '@/features/home/queries'

// Acciones rápidas de "Necesita tu acción" (Inicio) — a propósito NO
// reusan `useMoveTaskMutation`/`toggleDone` de TaskCard.tsx: esas viven
// atadas a un solo proyecto (reciben `statuses`/`allTasks` de ESE
// proyecto por prop) y una tarjeta de Inicio puede ser de cualquiera. Acá
// se resuelve el status "hecho" del proyecto que corresponda en cada
// llamada, vía `statusesQueryOptions` (ya cacheada si list.tsx/board.tsx
// de ese proyecto se visitó antes; si no, se pide una vez y punto —
// las columnas de un proyecto casi no cambian).
//
// `updateTaskFields` (features/tasks/api.ts) es un UPDATE plano — sin
// RPC — pero los gates de dependencias/revisor (0045/0046) son un
// trigger `before update of status_id on nodes`, no lógica adentro de
// `move_task_node`: se aplican igual, así que marcar "Hecha" una tarea
// con revisores sin aprobar sigue rechazándose del lado de la base.

function invalidateHomeAndMyTasks(
  queryClient: ReturnType<typeof useQueryClient>,
  vars: { workspaceId: string; userId: string; projectId: string | null },
) {
  void queryClient.invalidateQueries({ queryKey: myOpenTasksQueryOptions(vars.workspaceId, vars.userId).queryKey })
  void queryClient.invalidateQueries({ queryKey: myTasksQueryOptions(vars.workspaceId, vars.userId).queryKey })
  void queryClient.invalidateQueries({ queryKey: delegatedTasksQueryOptions(vars.workspaceId, vars.userId).queryKey })
  if (vars.projectId) void queryClient.invalidateQueries({ queryKey: tasksListKeyPrefix(vars.projectId) })
}

export function useMarkTaskDoneMutation(workspaceId: string, userId: string) {
  const queryClient = useQueryClient()
  const key = myOpenTasksQueryOptions(workspaceId, userId).queryKey

  return useMutation({
    mutationFn: async (vars: { taskId: string; projectId: string; done: boolean }) => {
      const statuses = await queryClient.fetchQuery(statusesQueryOptions(vars.projectId))
      const target = vars.done
        ? statuses.find((s) => s.status_kind === 'success')
        : (statuses.find((s) => s.is_default) ?? statuses[0])
      if (!target) throw new Error('Este proyecto no tiene un estado de "hecho" configurado.')
      await updateTaskFields(vars.taskId, { status_id: target.id })
      return target
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<FocusTaskRow[]>(key)
      queryClient.setQueryData<FocusTaskRow[]>(key, (old) =>
        (old ?? []).map((t) =>
          t.id === vars.taskId
            ? {
                ...t,
                completed_at: vars.done ? new Date().toISOString() : null,
                status: t.status && vars.done ? { ...t.status, status_kind: 'success' } : t.status,
              }
            : t,
        ),
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la tarea.')
    },
    onSettled: (_data, _err, vars) => invalidateHomeAndMyTasks(queryClient, { workspaceId, userId, projectId: vars.projectId }),
  })
}

export function useRescheduleTomorrowMutation(workspaceId: string, userId: string) {
  const queryClient = useQueryClient()
  const key = myOpenTasksQueryOptions(workspaceId, userId).queryKey

  return useMutation({
    mutationFn: async (vars: { taskId: string; projectId: string | null }) => {
      const tomorrow = format(addDaysSafe(new Date(), 1), 'yyyy-MM-dd')
      await updateTaskFields(vars.taskId, { due_date: tomorrow })
      return tomorrow
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<FocusTaskRow[]>(key)
      const tomorrow = format(addDaysSafe(new Date(), 1), 'yyyy-MM-dd')
      queryClient.setQueryData<FocusTaskRow[]>(key, (old) =>
        (old ?? []).map((t) => (t.id === vars.taskId ? { ...t, due_date: tomorrow } : t)),
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      toast.error('No se pudo mover la tarea a mañana.')
    },
    onSuccess: () => toast.success('Tarea movida a mañana.'),
    onSettled: (_data, _err, vars) => invalidateHomeAndMyTasks(queryClient, { workspaceId, userId, projectId: vars.projectId }),
  })
}

/** "Aprobar" en una fila de "Te piden revisión" — misma RPC que el
 * detalle de tarea (decide_task_review, 0046_reviewer_gate.sql), solo
 * que acá invalida `pendingReviewsQueryOptions` en vez del detalle. */
export function useApproveReviewMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => decideTaskReview(taskId, true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pendingReviewsQueryOptions(userId).queryKey })
      toast.success('Revisión aprobada.')
    },
    onError: () => toast.error('No se pudo aprobar la revisión.'),
  })
}

// `date-fns/addDays` directo tendría que importarse dos veces (acá y en
// el `onMutate` de arriba) para el mismo cálculo — envuelto una vez para
// no repetir la construcción de fecha.
function addDaysSafe(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
