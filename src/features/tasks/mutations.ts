import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { between } from '@/lib/position'
import { withOfflineFallback } from '@/lib/offline-queue'
import {
  createPersonalTask,
  createTask,
  deleteTask,
  deleteTaskRecurrence,
  duplicateTask,
  insertTaskNode,
  moveTask,
  promoteSubtaskToTask,
  rebalancePositions,
  updateTaskFields,
  upsertTaskRecurrence,
  type NewTaskInput,
  type TaskFieldsUpdate,
  type TaskRecurrenceInput,
} from '@/features/tasks/api'
import {
  delegatedTasksQueryOptions,
  myTasksQueryOptions,
  personalTasksQueryOptions,
  subtasksQueryOptions,
  taskDetailQueryOptions,
  taskRecurrenceQueryOptions,
  tasksListKeyPrefix,
  type PersonalTaskRow,
  type ProfileSummary,
  type SubtaskSummary,
  type TaskRecurrenceRow,
  type TaskSummary,
} from '@/features/tasks/queries'

// `tasksListKeyPrefix` (no `tasksQueryOptions(containerId).queryKey`) en
// todo este archivo: la key completa ahora incluye `includeDescription`
// (ver queries.ts), y list.tsx puede tener montada la variante `true`
// mientras board.tsx tiene la `false` — patchear solo una key exacta deja
// la otra desactualizada indefinidamente (`staleTime: Infinity` global,
// sin refetch de fondo). `cancelQueries`/`invalidateQueries` ya hacen
// match por prefijo con un array más corto; para lecturas/escrituras
// puntuales se usa `getQueriesData`/`setQueriesData` (plural).
function readTasksCache(queryClient: ReturnType<typeof useQueryClient>, containerId: string): TaskSummary[] {
  const entries = queryClient.getQueriesData<TaskSummary[]>({ queryKey: tasksListKeyPrefix(containerId) })
  return entries.find(([, data]) => data)?.[1] ?? []
}

// Los `onError` de este archivo ya revertían el patch optimista, pero en
// silencio: la tarjeta volvía sola a su lugar sin decir por qué, y el usuario
// no tenía cómo distinguir "el servidor lo rechazó" de "no se movió bien".
// Ahora que 0017_rpc_authz.sql hace que las RPCs puedan responder 403, ese
// silencio es peor todavía.
//
// Los fallos de red NO llegan acá: `withOfflineFallback` los encola y resuelve
// como éxito (ver offline-queue.ts), así que todo lo que aterrice en un
// onError es un rechazo real del servidor y merece aviso.
// GY001/GY002: errcode custom que levantan los triggers de gate en nodes
// (enforce_dependency_gate, 0045; enforce_reviewer_gate, 0046) al intentar
// completar una tarea que todavía no puede completarse — mensaje
// específico en vez del genérico, para que se entienda qué falta, no solo
// que falló.
const GATE_ERROR_MESSAGE: Record<string, string> = {
  GY001: 'Esta tarea tiene dependencias sin completar todavía.',
  GY002: 'Esta tarea requiere aprobación antes de completarse.',
}

function notifyMutationError(action: string) {
  return (err: unknown) => {
    const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined
    if (code && GATE_ERROR_MESSAGE[code]) {
      toast.error(GATE_ERROR_MESSAGE[code])
      return
    }
    toast.error(
      code === '42501' ? 'No tienes permiso para hacer esto' : `No se pudo ${action}. Vuelve a intentarlo.`,
    )
  }
}

export function useBulkUpdateTasksMutation(containerId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)

  return useMutation({
    mutationFn: async (vars: { taskIds: string[]; fields: TaskFieldsUpdate }) => {
      await Promise.all(vars.taskIds.map((id) => updateTaskFields(id, vars.fields)))
    },
    onSuccess: () => {
      // excepción aceptada: acción bulk poco frecuente disparada desde
      // atajos de teclado (A/D con selección múltiple) — más simple que
      // replicar optimistic update por cada tarea seleccionada.
      queryClient.invalidateQueries({ queryKey: keyPrefix })
    },
    onError: (err) => {
      // El Promise.all falla apenas una tarea es rechazada, así que puede
      // haber quedado a medio aplicar: se invalida igual para que la lista
      // muestre el estado real del servidor en vez de la mezcla.
      queryClient.invalidateQueries({ queryKey: keyPrefix })
      notifyMutationError('actualizar las tareas seleccionadas')(err)
    },
  })
}

export function useCreateTaskMutation(containerId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)

  return useMutation({
    mutationFn: (vars: { title: string; statusId: string; dueDate?: string; isMilestone?: boolean; assigneeId?: string }) => {
      const existing = readTasksCache(queryClient, containerId)
      const lastInColumn = existing
        .filter((t) => t.status_id === vars.statusId)
        .sort((a, b) => b.position - a.position)[0]
      const position = between(lastInColumn?.position, undefined)
      // Generado siempre client-side, online y offline (ver api.ts) —
      // permite encolar el insert y aplicarlo después sin depender de
      // un id que solo el servidor conociera.
      const id = crypto.randomUUID()
      const input: NewTaskInput = {
        id,
        containerId,
        title: vars.title,
        statusId: vars.statusId,
        position,
        dueDate: vars.dueDate ?? null,
        isMilestone: vars.isMilestone,
        // D2/A2 ("Quién queda a cargo al crear"): crear dentro de una
        // columna/sección agrupada por Persona asignada asigna directo
        // (board.tsx/list.tsx, createTaskInGroup) — un solo round-trip,
        // igual que isMilestone. `create_task_node` ya soportaba este
        // parámetro (lo usaba con `null` fijo); acá se empieza a pasar
        // un valor real.
        assigneeId: vars.assigneeId ?? null,
      }
      // Argumentos de la RPC `create_task_node` (no un row de tabla): a
      // diferencia del viejo INSERT directo, la creación siempre pasa por
      // esta RPC — tanto online como al hacer flush de la cola offline
      // (ver `applyQueuedEntry` en offline-queue.ts). Ya no hace falta
      // ningún workaround de `workspace_id`: la RPC lo resuelve
      // server-side desde el container.
      const rpcArgs = {
        p_id: id,
        p_container_id: containerId,
        p_title: vars.title,
        p_status_id: vars.statusId,
        p_position: position,
        p_priority: 'medium',
        p_assignee_id: vars.assigneeId ?? null,
        p_due_date: vars.dueDate ?? null,
        p_parent_id: null,
        p_is_milestone: vars.isMilestone ?? undefined,
      }
      return withOfflineFallback(
        { op: 'insert', node_id: id, container_id: containerId, payload: rpcArgs },
        () => createTask(input),
        (): TaskSummary => ({
          id,
          title: vars.title,
          status_id: vars.statusId,
          // Fallback offline: solo el escalar, sin `assignee`/
          // `task_assignees` resueltos (no hay perfil a mano acá) — se
          // corrige solo en cuanto el insert real sincroniza (el trigger
          // `trg_sync_assignee_id_to_task_assignees`, 0041, corre en
          // INSERT). Edge case raro (crear offline Y agrupado por
          // persona), tolerable.
          assignee_id: vars.assigneeId ?? null,
          priority: 'medium',
          due_date: vars.dueDate ?? null,
          due_time: null,
          start_date: null,
          start_time: null,
          is_milestone: vars.isMilestone ?? false,
          completed_at: null,
          has_recurrence: false,
          position,
          parent_id: null,
          container_id: containerId,
          custom_fields: {},
          created_at: new Date().toISOString(),
          assignee: null,
          task_assignees: [],
          task_labels: [],
        }),
      )
    },
    onSuccess: (created) => {
      // Guard de existencia: `createTask` ahora es 2 round-trips (RPC +
      // fetch, antes era 1 insert+select) — le da tiempo de sobra al
      // evento de Realtime de la propia inserción (uno mismo también está
      // suscripto al canal) a llegar y agregar la tarea primero. Sin este
      // guard, quedaba duplicada en la lista (bug real encontrado
      // probando esto en navegador — misma tarea, mismo id, 2 veces).
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) =>
        old?.some((t) => t.id === created.id) ? old : [...(old ?? []), created],
      )
    },
    // Sin onMutate optimista acá (la tarea se agrega recién en onSuccess), así
    // que no hay nada que revertir — pero sin este aviso, escribir un título y
    // presionar Enter contra un rechazo del servidor simplemente no hacía nada
    // visible: el input se vaciaba y la tarea nunca aparecía.
    onError: notifyMutationError('crear la tarea'),
  })
}

export function useUpdateTaskFieldsMutation(containerId: string, taskId: string) {
  const queryClient = useQueryClient()
  const listKeyPrefix = tasksListKeyPrefix(containerId)
  const detailKey = taskDetailQueryOptions(taskId).queryKey

  return useMutation({
    mutationFn: (fields: TaskFieldsUpdate) => {
      const cachedDetail = queryClient.getQueryData(detailKey) as { updated_at?: string } | undefined
      return withOfflineFallback(
        {
          op: 'update',
          node_id: taskId,
          container_id: containerId,
          payload: { ...fields },
          base_updated_at: cachedDetail?.updated_at ?? null,
        },
        () => updateTaskFields(taskId, fields),
        () => undefined,
      )
    },
    onMutate: async (fields) => {
      await queryClient.cancelQueries({ queryKey: listKeyPrefix })
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previousLists = queryClient.getQueriesData<TaskSummary[]>({ queryKey: listKeyPrefix })
      const previousDetail = queryClient.getQueryData(detailKey)
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: listKeyPrefix }, (old) =>
        old?.map((t) => (t.id === taskId ? { ...t, ...fields } : t)) ?? [],
      )
      queryClient.setQueryData(detailKey, (old) => (old ? { ...old, ...fields } : old))
      return { previousLists, previousDetail }
    },
    onError: (err, _vars, ctx) => {
      ctx?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (ctx?.previousDetail) queryClient.setQueryData(detailKey, ctx.previousDetail)
      notifyMutationError('guardar el cambio')(err)
    },
  })
}

// Repetición: tabla auxiliar (task_recurrences), mismo trato que
// useToggleTaskLabelMutation (features/labels/mutations.ts) — optimistic
// update + rollback sin pasar por withOfflineFallback, porque la cola
// offline (offline-queue.ts) solo sabe reproducir escrituras contra
// `nodes` (op 'update' hace `.from('nodes').update(...)`); no tiene
// noción de otras tablas. `rule: null` borra la regla (deja de repetir).
export function useUpdateTaskRecurrenceMutation(containerId: string, taskId: string) {
  const queryClient = useQueryClient()
  const listKeyPrefix = tasksListKeyPrefix(containerId)
  const recurrenceKey = taskRecurrenceQueryOptions(taskId).queryKey

  return useMutation({
    mutationFn: (rule: TaskRecurrenceInput | null) =>
      rule ? upsertTaskRecurrence(taskId, rule) : deleteTaskRecurrence(taskId),
    onMutate: async (rule) => {
      await queryClient.cancelQueries({ queryKey: listKeyPrefix })
      await queryClient.cancelQueries({ queryKey: recurrenceKey })
      const previousLists = queryClient.getQueriesData<TaskSummary[]>({ queryKey: listKeyPrefix })
      const previousRecurrence = queryClient.getQueryData(recurrenceKey)

      queryClient.setQueriesData<TaskSummary[]>({ queryKey: listKeyPrefix }, (old) =>
        old?.map((t) => (t.id === taskId ? { ...t, has_recurrence: rule !== null } : t)) ?? [],
      )
      queryClient.setQueryData(recurrenceKey, (): TaskRecurrenceRow | null =>
        rule
          ? {
              id: previousRecurrence?.id ?? '',
              node_id: taskId,
              frequency: rule.frequency,
              interval: rule.interval,
              days_of_week: rule.daysOfWeek ?? null,
              ends_on: rule.endsOn ?? null,
              occurrences_left: rule.occurrencesLeft ?? null,
              created_at: previousRecurrence?.created_at ?? new Date().toISOString(),
            }
          : null,
      )
      return { previousLists, previousRecurrence }
    },
    onError: (err, _vars, ctx) => {
      ctx?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      queryClient.setQueryData(recurrenceKey, () => ctx?.previousRecurrence ?? null)
      notifyMutationError('actualizar la repetición')(err)
    },
  })
}

export function useMoveTaskMutation(containerId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)

  return useMutation({
    mutationFn: (vars: { taskId: string; statusId: string; position: number }) =>
      withOfflineFallback(
        {
          op: 'move',
          node_id: vars.taskId,
          container_id: containerId,
          payload: { status_id: vars.statusId, position: vars.position },
        },
        () => moveTask(vars.taskId, containerId, vars.statusId, vars.position),
        () => undefined,
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: keyPrefix })
      const previous = queryClient.getQueriesData<TaskSummary[]>({ queryKey: keyPrefix })
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) =>
        old?.map((t) =>
          t.id === vars.taskId ? { ...t, status_id: vars.statusId, position: vars.position } : t,
        ) ?? [],
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      notifyMutationError('mover la tarea')(err)
    },
  })
}

// Reschedule (drag & drop en Calendario): calca useMoveTaskMutation
// (optimistic update + rollback), pero solo toca `due_date` — sin
// posición/columna involucrada, a diferencia de mover entre statuses.
export function useRescheduleTaskMutation(containerId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)

  return useMutation({
    mutationFn: (vars: { taskId: string; dueDate: string | null }) =>
      withOfflineFallback(
        { op: 'update', node_id: vars.taskId, container_id: containerId, payload: { due_date: vars.dueDate } },
        () => updateTaskFields(vars.taskId, { due_date: vars.dueDate }),
        () => undefined,
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: keyPrefix })
      const previous = queryClient.getQueriesData<TaskSummary[]>({ queryKey: keyPrefix })
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) =>
        old?.map((t) => (t.id === vars.taskId ? { ...t, due_date: vars.dueDate } : t)) ?? [],
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      notifyMutationError('cambiar la fecha')(err)
    },
  })
}

// Arrastrar una tarjeta entre columnas del Board/secciones de Lista
// cuando "Agrupar por" está en Prioridad (useNodeViewController.ts) — calca
// useRescheduleTaskMutation, pero toca `priority`. A diferencia de
// useMoveTaskMutation (agrupar por Estado), acá no hay `position` que
// recalcular: el orden dentro del grupo no está atado a la prioridad a
// nivel de datos, así que la tarjeta conserva la posición que ya tenía.
export function useSetTaskPriorityMutation(containerId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)

  return useMutation({
    mutationFn: (vars: { taskId: string; priority: string }) =>
      withOfflineFallback(
        { op: 'update', node_id: vars.taskId, container_id: containerId, payload: { priority: vars.priority } },
        () => updateTaskFields(vars.taskId, { priority: vars.priority }),
        () => undefined,
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: keyPrefix })
      const previous = queryClient.getQueriesData<TaskSummary[]>({ queryKey: keyPrefix })
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) =>
        old?.map((t) => (t.id === vars.taskId ? { ...t, priority: vars.priority } : t)) ?? [],
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      notifyMutationError('cambiar la prioridad')(err)
    },
  })
}

// Mismo patrón que useSetTaskPriorityMutation, para "Agrupar por" en Tipo
// de tarea (Tarea/Hito, `is_milestone` — ver CreateTaskButton.tsx para el
// mismo criterio de nombres).
export function useSetTaskMilestoneMutation(containerId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)

  return useMutation({
    mutationFn: (vars: { taskId: string; isMilestone: boolean }) =>
      withOfflineFallback(
        { op: 'update', node_id: vars.taskId, container_id: containerId, payload: { is_milestone: vars.isMilestone } },
        () => updateTaskFields(vars.taskId, { is_milestone: vars.isMilestone }),
        () => undefined,
      ),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: keyPrefix })
      const previous = queryClient.getQueriesData<TaskSummary[]>({ queryKey: keyPrefix })
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) =>
        old?.map((t) => (t.id === vars.taskId ? { ...t, is_milestone: vars.isMilestone } : t)) ?? [],
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      notifyMutationError('cambiar el tipo de tarea')(err)
    },
  })
}

// Mover/redimensionar una barra en Gantt: a diferencia de
// useRescheduleTaskMutation (Calendario, solo due_date), acá se tocan
// start_date y due_date juntos en un solo request — mover la barra entera
// cambia ambos por el mismo delta, redimensionar un borde cambia uno solo
// (el caller pasa el que corresponda, el otro queda `undefined` y no se
// toca).
export function useUpdateTaskScheduleMutation(containerId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)

  return useMutation({
    mutationFn: (vars: { taskId: string; startDate?: string | null; dueDate?: string | null }) => {
      const fields: TaskFieldsUpdate = {}
      if (vars.startDate !== undefined) fields.start_date = vars.startDate
      if (vars.dueDate !== undefined) fields.due_date = vars.dueDate
      return withOfflineFallback(
        { op: 'update', node_id: vars.taskId, container_id: containerId, payload: { ...fields } },
        () => updateTaskFields(vars.taskId, fields),
        () => undefined,
      )
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: keyPrefix })
      const previous = queryClient.getQueriesData<TaskSummary[]>({ queryKey: keyPrefix })
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) =>
        old?.map((t) =>
          t.id === vars.taskId
            ? {
                ...t,
                start_date: vars.startDate !== undefined ? vars.startDate : t.start_date,
                due_date: vars.dueDate !== undefined ? vars.dueDate : t.due_date,
              }
            : t,
        ) ?? [],
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      notifyMutationError('actualizar las fechas')(err)
    },
  })
}

export function useRebalanceMutation(containerId: string) {
  return useMutation({
    mutationFn: () => rebalancePositions(containerId),
    // Sin optimistic update que revertir: el board hace `mutateAsync` y
    // refetchea después (ver handleDragEnd), así que acá solo falta el aviso.
    onError: notifyMutationError('reordenar el tablero'),
  })
}

// F-06: margen para "Deshacer" antes de que el borrado le llegue de verdad
// al servidor — ver DeleteUndoneError más abajo y el caller en
// NodeDetailContent.tsx.
export const DELETE_UNDO_DELAY_MS = 5000

// Distingue "se canceló a propósito desde el toast Deshacer" de un error de
// servidor real — ambos entran a onError (abajo), pero solo el segundo
// amerita el toast de "no se pudo".
class DeleteUndoneError extends Error {}

// `extraCaches`: Mi trabajo (myTasksQueryOptions), Lista personal
// (personalTasksQueryOptions) y Delegado (delegatedTasksQueryOptions) leen
// de keys que NO comparten prefijo con `tasksListKeyPrefix` (esas son
// `['tasks', containerId]`; estas son `['my-tasks', ...]`/etc.) — sin
// pasarlo, borrar una tarea que aparece ahí (una personal, sin
// `containerId`, o cualquiera asignada a quien la borra) la dejaba viva en
// esos widgets hasta recargar la página entera (`staleTime: Infinity`
// global, nada la vuelve a pedir sola). Encontrado reportado por el
// usuario: tareas de prueba en "Mi trabajo"/"Lista personal" que no se
// podían ni abrir ni borrar.
export function useDeleteTaskMutation(containerId: string, extraCaches?: { workspaceId: string; userId: string | undefined }) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)
  const extraKeys = extraCaches
    ? [
        myTasksQueryOptions(extraCaches.workspaceId, extraCaches.userId).queryKey,
        personalTasksQueryOptions(extraCaches.workspaceId, extraCaches.userId).queryKey,
        delegatedTasksQueryOptions(extraCaches.workspaceId, extraCaches.userId).queryKey,
      ]
    : []

  return useMutation({
    // El remove optimista de onMutate (abajo) sigue siendo instantáneo — la
    // fila desaparece al toque. Lo que se demora es esto: la llamada real al
    // servidor espera DELETE_UNDO_DELAY_MS, y si `undoState.cancelled` ya es
    // true a esa altura (el toast de Deshacer lo marcó), ni siquiera llega a
    // hacerla.
    mutationFn: ({ taskId, undoState }: { taskId: string; undoState: { cancelled: boolean } }) =>
      new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          if (undoState.cancelled) {
            reject(new DeleteUndoneError())
            return
          }
          withOfflineFallback(
            { op: 'delete', node_id: taskId, container_id: containerId, payload: {} },
            () => deleteTask(taskId),
            () => undefined,
          ).then(resolve, reject)
        }, DELETE_UNDO_DELAY_MS)
      }),
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: keyPrefix })
      const previous = queryClient.getQueriesData<TaskSummary[]>({ queryKey: keyPrefix })
      queryClient.setQueriesData<TaskSummary[]>({ queryKey: keyPrefix }, (old) => old?.filter((t) => t.id !== taskId) ?? [])

      const extraPrevious = await Promise.all(
        extraKeys.map(async (key) => {
          await queryClient.cancelQueries({ queryKey: key })
          const prev = queryClient.getQueryData<{ id: string }[]>(key)
          queryClient.setQueryData<{ id: string }[]>(key, (old) => old?.filter((t) => t.id !== taskId) ?? old)
          return [key, prev] as const
        }),
      )
      return { previous, extraPrevious }
    },
    onError: (err, _vars, ctx) => {
      ctx?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      ctx?.extraPrevious?.forEach(([key, data]) => queryClient.setQueryData(key, data as never))
      if (err instanceof DeleteUndoneError) return
      notifyMutationError('eliminar la tarea')(err)
    },
  })
}

// Sin optimistic update: no hay forma barata de anticipar la forma
// completa de la tarea nueva (subtareas/labels/responsables copiados
// server-side) — se invalida la lista al terminar, mismo criterio que
// useBulkUpdateTasksMutation.
export function useDuplicateTaskMutation(containerId: string) {
  const queryClient = useQueryClient()
  const keyPrefix = tasksListKeyPrefix(containerId)

  return useMutation({
    mutationFn: (vars: { taskId: string; statusId: string }) => {
      const existing = readTasksCache(queryClient, containerId)
      const lastInColumn = existing
        .filter((t) => t.status_id === vars.statusId)
        .sort((a, b) => b.position - a.position)[0]
      const position = between(lastInColumn?.position, undefined)
      return duplicateTask(vars.taskId, containerId, vars.statusId, position)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyPrefix }),
    onError: notifyMutationError('duplicar la tarea'),
  })
}

export function useUpdateSubtaskStatusMutation(parentTaskId: string) {
  const queryClient = useQueryClient()
  const key = subtasksQueryOptions(parentTaskId).queryKey

  return useMutation({
    // `status`, no solo `statusId`: el checkbox de SubtaskList.tsx lee
    // `subtask.status?.status_kind` (el objeto embebido), no `status_id`
    // — mandar solo el id dejaba el patch optimista de abajo actualizando
    // un campo que la UI ni siquiera mira, así que el check no se movía
    // hasta que un remount volvía a traer el embed fresco desde el
    // servidor. Reportado por el usuario: "cuesta mucho marcar las
    // subtareas como hechas... solo si recargo la página se ve".
    mutationFn: (vars: { taskId: string; status: NonNullable<SubtaskSummary['status']> }) =>
      updateTaskFields(vars.taskId, { status_id: vars.status.id }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SubtaskSummary[]>(key)
      queryClient.setQueryData<SubtaskSummary[]>(key, (old) =>
        old?.map((s) => (s.id === vars.taskId ? { ...s, status_id: vars.status.id, status: vars.status } : s)) ?? [],
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      notifyMutationError('actualizar la subtarea')(err)
    },
    // Red de seguridad: `staleTime: Infinity` es global (query-client.ts),
    // así que sin esto un patch optimista que quedara desalineado del
    // servidor (carrera con otro dispositivo tocando la misma subtarea)
    // no se corregiría solo nunca — nada más vuelve a pedir esta key.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useCreateSubtaskMutation(containerId: string, parentTaskId: string) {
  const queryClient = useQueryClient()
  const key = subtasksQueryOptions(parentTaskId).queryKey

  return useMutation({
    mutationFn: async (vars: {
      title: string
      statusId: string
      assigneeId?: string | null
      assigneeProfile?: ProfileSummary | null
    }) => {
      const id = crypto.randomUUID()
      const position = between(undefined, undefined)
      // insertTaskNode (solo el INSERT), no createTask: esa función hace
      // ADEMÁS un round-trip de lectura (fetchTaskNode) para devolver el
      // TaskSummary completo — un round-trip que acá no hace falta, ya
      // conocemos cada campo del SubtaskSummary de antemano (título/
      // estado/prioridad/responsable los puso este mismo formulario). Ese
      // fetch de más era además un punto de falla real: si fallaba por
      // cualquier motivo (fetchTaskNode, no fetchTaskSummary — la
      // subtarea no tiene fila en node_memberships), createTask entero
      // rechazaba aunque el INSERT ya hubiera confirmado — la subtarea
      // quedaba guardada en el servidor pero nunca aparecía en pantalla
      // sin refrescar, y encima el usuario veía un toast de error sobre
      // algo que en realidad sí se había guardado. Reportado por el
      // usuario. `p_assignee_id` directo en el INSERT (no un
      // addTaskAssignee aparte después): una subtarea tiene un único
      // responsable, no un pool — create_task_node ya acepta ese campo
      // escalar tal cual.
      await insertTaskNode({
        id,
        containerId,
        title: vars.title,
        statusId: vars.statusId,
        position,
        parentId: parentTaskId,
        assigneeId: vars.assigneeId,
      })
      return {
        summary: {
          id,
          title: vars.title,
          status_id: vars.statusId,
          priority: 'medium',
          due_date: null,
          status: null,
          assignee_id: vars.assigneeId ?? null,
          assignee: vars.assigneeProfile ?? null,
        } satisfies SubtaskSummary,
      }
    },
    onSuccess: ({ summary }) => {
      queryClient.setQueryData<SubtaskSummary[]>(key, (old) =>
        old?.some((s) => s.id === summary.id) ? old : [...(old ?? []), summary],
      )
    },
    onError: notifyMutationError('crear la subtarea'),
  })
}

// Mismo patrón "Deshacer" de useDeleteTaskMutation (DELETE_UNDO_DELAY_MS,
// DeleteUndoneError — ambos definidos ahí arriba, mismo archivo), pero
// contra la cache de useSubtasks en vez de tasksListKeyPrefix: acá no se
// cierra ningún panel, solo desaparece la fila de la lista.
export function useDeleteSubtaskMutation(parentTaskId: string) {
  const queryClient = useQueryClient()
  const key = subtasksQueryOptions(parentTaskId).queryKey

  return useMutation({
    mutationFn: ({ taskId, undoState }: { taskId: string; undoState: { cancelled: boolean } }) =>
      new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          if (undoState.cancelled) {
            reject(new DeleteUndoneError())
            return
          }
          deleteTask(taskId).then(resolve, reject)
        }, DELETE_UNDO_DELAY_MS)
      }),
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SubtaskSummary[]>(key)
      queryClient.setQueryData<SubtaskSummary[]>(key, (old) => old?.filter((s) => s.id !== taskId) ?? [])
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      if (err instanceof DeleteUndoneError) return
      notifyMutationError('eliminar la subtarea')(err)
    },
  })
}

// Una subtarea tiene UN solo responsable (nodes.assignee_id, sin pool de
// task_assignees) — decisión explícita del usuario: es la unidad atómica
// en la que ya se dividió el trabajo, no necesita "varios asignados"
// propio. `assigneeProfile` viaja en la propia llamada (no se resuelve
// acá): tanto el quick-assign de SubtaskList.tsx (avatares de
// parentAssignees) como SubtaskAssigneePicker (useWorkspaceMembers) ya
// tienen el perfil en mano en el momento del click, así que no hace
// falta una segunda consulta solo para pintar el parche optimista.
export function useSetSubtaskAssigneeMutation(parentTaskId: string) {
  const queryClient = useQueryClient()
  const key = subtasksQueryOptions(parentTaskId).queryKey

  return useMutation({
    mutationFn: (vars: { taskId: string; assigneeId: string | null; assigneeProfile: ProfileSummary | null }) =>
      updateTaskFields(vars.taskId, { assignee_id: vars.assigneeId }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SubtaskSummary[]>(key)
      queryClient.setQueryData<SubtaskSummary[]>(key, (old) =>
        old?.map((s) =>
          s.id === vars.taskId ? { ...s, assignee_id: vars.assigneeId, assignee: vars.assigneeProfile } : s,
        ) ?? [],
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      notifyMutationError('asignar la subtarea')(err)
    },
  })
}

// "Lista personal": sin `withOfflineFallback` a propósito — a
// diferencia del resto de las mutaciones de tareas, esta es una feature
// nueva y liviana (v1) que todavía no está cableada a la cola offline
// (src/lib/offline-queue.ts); queda para cuando haga falta.
export function useCreatePersonalTaskMutation(workspaceId: string, userId: string | undefined) {
  const queryClient = useQueryClient()
  const key = personalTasksQueryOptions(workspaceId, userId).queryKey

  return useMutation({
    mutationFn: (vars: { title: string; dueDate?: string | null; priority?: string }) => {
      if (!userId) throw new Error('No hay sesión activa')
      return createPersonalTask({
        id: crypto.randomUUID(),
        workspaceId,
        userId,
        title: vars.title,
        dueDate: vars.dueDate,
        priority: vars.priority,
      })
    },
    onSuccess: (created) => {
      queryClient.setQueryData<PersonalTaskRow[]>(key, (old) => [created, ...(old ?? [])])
    },
    onError: notifyMutationError('crear la tarea'),
  })
}

export function useToggleTaskDoneMutation(workspaceId: string, userId: string | undefined) {
  const queryClient = useQueryClient()
  const key = personalTasksQueryOptions(workspaceId, userId).queryKey

  return useMutation({
    mutationFn: (vars: { taskId: string; done: boolean }) =>
      updateTaskFields(vars.taskId, { completed_at: vars.done ? new Date().toISOString() : null }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<PersonalTaskRow[]>(key)
      const completedAt = vars.done ? new Date().toISOString() : null
      queryClient.setQueryData<PersonalTaskRow[]>(key, (old) =>
        old?.map((t) => (t.id === vars.taskId ? { ...t, completed_at: completedAt } : t)) ?? [],
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      notifyMutationError('actualizar la tarea')(err)
    },
  })
}

// El diálogo de "Cerrar con subtareas abiertas" (NodeDetailContent.tsx,
// CloseWithSubtasksDialog.tsx) — aplica UNA de las 3 opciones a TODAS las
// subtareas pendientes a la vez. `discard`/`complete` son un `status_id`
// directo (el caller ya resolvió cuál, statuses.tsx ya está cargado
// ahí); `promote` llama la RPC nueva (0081_close_with_subtasks.sql), que
// además resuelve la posición server-side. Se llama ANTES de mandar el
// cambio de estado del padre — para cuando ese update llega,
// `trg_close_open_subtasks_on_parent_done` (el default no interactivo,
// R6) no encuentra nada pendiente que tocar.
export function useResolveSubtasksMutation(parentId: string, containerId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { subtaskIds: string[]; action: 'discard' | 'complete' | 'promote'; statusId?: string }) => {
      if (vars.action === 'promote') {
        await Promise.all(vars.subtaskIds.map((id) => promoteSubtaskToTask(id, containerId)))
        return
      }
      if (!vars.statusId) throw new Error('resolveSubtasks: falta statusId para discard/complete')
      await Promise.all(vars.subtaskIds.map((id) => updateTaskFields(id, { status_id: vars.statusId })))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subtasksQueryOptions(parentId).queryKey })
      queryClient.invalidateQueries({ queryKey: tasksListKeyPrefix(containerId) })
    },
    onError: notifyMutationError('resolver las subtareas'),
  })
}

// R3 de la misma decisión: al reabrir el padre, restaurar las subtareas
// que la cascada de 0081/0082 había tocado a su `previous_status_id` de
// entonces (uno por subtarea, no un único status para todas — a
// diferencia de useResolveSubtasksMutation, acá cada una puede volver a
// un estado distinto).
export function useRestoreSubtasksMutation(parentId: string, containerId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { restores: { subtaskId: string; statusId: string }[] }) => {
      await Promise.all(vars.restores.map((r) => updateTaskFields(r.subtaskId, { status_id: r.statusId })))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subtasksQueryOptions(parentId).queryKey })
      queryClient.invalidateQueries({ queryKey: tasksListKeyPrefix(containerId) })
    },
    onError: notifyMutationError('restaurar las subtareas'),
  })
}
