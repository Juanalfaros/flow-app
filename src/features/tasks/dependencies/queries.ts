import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TaskDependency } from '@/features/tasks/dependencies/api'

// Filtrado client-side a pares donde AMBOS extremos están en `taskIds`:
// el `.in('predecessor_id', taskIds)` solo puede filtrar por un lado, y
// una dependencia hacia una tarea fuera del proyecto actual (otro
// container) no tiene fila que dibujar en este Gantt.
export const taskDependenciesQueryOptions = (taskIds: string[]) =>
  queryOptions({
    queryKey: ['task-dependencies', [...taskIds].sort()] as const,
    queryFn: async (): Promise<TaskDependency[]> => {
      const { data, error } = await supabase
        .from('task_dependencies')
        .select('id, predecessor_id, successor_id')
        .in('predecessor_id', taskIds)
      if (error) throw error
      const idSet = new Set(taskIds)
      return data.filter((d) => idSet.has(d.successor_id))
    },
    enabled: taskIds.length > 0,
  })

export function useTaskDependencies(taskIds: string[]) {
  return useQuery(taskDependenciesQueryOptions(taskIds))
}

export interface NodeDependencyTask {
  id: string
  title: string
  // Puede ser de OTRO proyecto (la RLS de task_dependencies solo exige
  // mismo workspace, no mismo container) — el link a la tarea necesita
  // saber a qué proyecto pertenece; sin fila en `node_memberships`
  // (subtarea) queda `null` y no se ofrece como link.
  container_id: string | null
}

export interface NodeDependency {
  id: string
  predecessor_id: string
  successor_id: string
  predecessor: NodeDependencyTask | null
  successor: NodeDependencyTask | null
}

/**
 * Dependencias de UNA tarea puntual — "Bloqueada por"/"Bloquea a" en el
 * panel de detalle (NodeDetailContent.tsx). Distinta de
 * `taskDependenciesQueryOptions` (que solo trae pares con AMBOS extremos
 * dentro de un set de tareas ya cargado, para dibujar el Gantt): acá el
 * otro extremo puede ser cualquier tarea del workspace, cargada bajo
 * demanda con su propio embed.
 */
export const nodeDependenciesQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: ['task-dependencies', 'node', taskId] as const,
    queryFn: async (): Promise<NodeDependency[]> => {
      const { data, error } = await supabase
        .from('task_dependencies')
        .select(
          `id, predecessor_id, successor_id,
           predecessor:nodes!task_dependencies_predecessor_id_fkey ( id, title, memberships:node_memberships!node_memberships_node_id_fkey ( container_id ) ),
           successor:nodes!task_dependencies_successor_id_fkey ( id, title, memberships:node_memberships!node_memberships_node_id_fkey ( container_id ) )`,
        )
        .or(`predecessor_id.eq.${taskId},successor_id.eq.${taskId}`)
      if (error) throw error
      return (
        data as unknown as {
          id: string
          predecessor_id: string
          successor_id: string
          predecessor: { id: string; title: string; memberships: { container_id: string }[] } | null
          successor: { id: string; title: string; memberships: { container_id: string }[] } | null
        }[]
      ).map((d) => ({
        id: d.id,
        predecessor_id: d.predecessor_id,
        successor_id: d.successor_id,
        predecessor: d.predecessor
          ? { id: d.predecessor.id, title: d.predecessor.title, container_id: d.predecessor.memberships[0]?.container_id ?? null }
          : null,
        successor: d.successor
          ? { id: d.successor.id, title: d.successor.title, container_id: d.successor.memberships[0]?.container_id ?? null }
          : null,
      }))
    },
    enabled: !!taskId,
  })

export function useNodeDependencies(taskId: string) {
  return useQuery(nodeDependenciesQueryOptions(taskId))
}
