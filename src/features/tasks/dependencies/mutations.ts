import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { addDependency, removeDependency } from '@/features/tasks/dependencies/api'
import { taskDependenciesQueryOptions } from '@/features/tasks/dependencies/queries'

// `taskIds` (mismo set que arma la query) resuelve la queryKey a invalidar
// — no hay optimistic update acá: un ciclo rechazado por RLS solo se sabe
// después del round-trip al servidor, así que esperar la respuesta real
// es más simple que aplicar y revertir.
export function useAddDependencyMutation(taskIds: string[]) {
  const queryClient = useQueryClient()
  const key = taskDependenciesQueryOptions(taskIds).queryKey

  return useMutation({
    mutationFn: (vars: { predecessorId: string; successorId: string }) =>
      addDependency(vars.predecessorId, vars.successorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useRemoveDependencyMutation(taskIds: string[]) {
  const queryClient = useQueryClient()
  const key = taskDependenciesQueryOptions(taskIds).queryKey

  return useMutation({
    mutationFn: (id: string) => removeDependency(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

/**
 * "Bloqueada por"/"Bloquea a" en el panel de detalle (NodeDetailContent.tsx)
 * — mismas dos funciones de api.ts que ya usa el Gantt, pero invalidando
 * por PREFIJO (`['task-dependencies']`, no una key exacta): una tarea
 * puede tener el Gantt Y el panel de detalle montados a la vez (el
 * Sideview flota sobre el propio Gantt en viewMode 'side'), y esto es lo
 * que hace que agregar/quitar una dependencia desde cualquiera de los dos
 * se refleje en el otro sin un segundo viaje a la red.
 */
// `_taskId` no se usa en el cuerpo (se invalida por prefijo, ver abajo) —
// se mantiene en la firma para que el call site quede explícito sobre
// cuál tarea es "el panel" y por si el día de mañana hace falta volver a
// invalidar por key exacta.
export function useAddNodeDependencyMutation(_taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: { predecessorId: string; successorId: string }) =>
      addDependency(vars.predecessorId, vars.successorId),
    // Prefijo, no la key exacta de `nodeDependenciesQueryOptions(taskId)`:
    // ['task-dependencies'] cubre esa Y la de taskDependenciesQueryOptions
    // (el Gantt) de una sola vez — invalidateQueries matchea por prefijo.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-dependencies'] }),
    onError: () => toast.error('No se pudo crear la dependencia (¿generaría un ciclo?).'),
  })
}

// `_taskId` sin usar en el cuerpo (el prefijo de abajo ya cubre su key):
// se mantiene en la firma por simetría con `useAddNodeDependencyMutation`
// y por si el día de mañana hace falta volver a invalidar por key exacta.
export function useRemoveNodeDependencyMutation(_taskId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => removeDependency(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-dependencies'] }),
  })
}
