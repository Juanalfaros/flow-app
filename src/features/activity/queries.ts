import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type ActivityEntry = Pick<
  Database['public']['Tables']['activity_log']['Row'],
  'id' | 'action' | 'payload' | 'created_at'
> & {
  actor: Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'avatar_url'> | null
}

export const activityQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: ['activity', taskId] as const,
    queryFn: async (): Promise<ActivityEntry[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, action, payload, created_at, actor:profiles(id, full_name, avatar_url)')
        .eq('node_id', taskId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!taskId,
  })

export function useActivity(taskId: string) {
  return useQuery(activityQueryOptions(taskId))
}

export type WorkspaceActivityEntry = ActivityEntry & {
  node: { id: string; title: string; memberships: { container_id: string }[] } | null
}

// Home page "Actividad reciente": mismo `activity_log`, pero scopeado
// por `workspace_id` (columna propia de la tabla) en vez de `node_id` —
// cruza todos los proyectos del workspace. Embebe el título de la tarea
// (la vista de detalle no lo necesita, por eso `activityQueryOptions` no
// lo trae) y su proyecto vía `node_memberships` para poder linkear cada
// entrada. `node` puede venir null si el nodo referenciado ya no existe.
export const workspaceActivityQueryOptions = (workspaceId: string, limit = 10) =>
  queryOptions({
    queryKey: ['activity', 'workspace', workspaceId, limit] as const,
    queryFn: async (): Promise<WorkspaceActivityEntry[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select(
          `
          id, action, payload, created_at,
          actor:profiles(id, full_name, avatar_url),
          node:nodes ( id, title, memberships:node_memberships!node_memberships_node_id_fkey ( container_id ) )
        `,
        )
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as unknown as WorkspaceActivityEntry[]
    },
    enabled: !!workspaceId,
  })

export function useWorkspaceActivity(workspaceId: string, limit?: number) {
  return useQuery(workspaceActivityQueryOptions(workspaceId, limit))
}

// Resumen de proyecto: actividad scopeada a un contenedor, no a todo el
// workspace. `activity_log` no tiene `container_id` propio (solo
// `node_id`/`workspace_id`), así que se resuelve en dos pasos: primero
// qué nodos son miembros de este contenedor (`node_memberships`, mismo
// índice que ya usa tasksQueryOptions), después el activity_log de esos
// nodos. Dos round-trips en vez de un filtro anidado de PostgREST sobre
// el embed — más simple de razonar y de mantener correcto.
export const projectActivityQueryOptions = (containerId: string, limit = 8) =>
  queryOptions({
    queryKey: ['activity', 'project', containerId, limit] as const,
    queryFn: async (): Promise<ActivityEntry[]> => {
      const { data: memberships, error: membershipsError } = await supabase
        .from('node_memberships')
        .select('node_id')
        .eq('container_id', containerId)
      if (membershipsError) throw membershipsError
      const nodeIds = memberships.map((m) => m.node_id)
      if (nodeIds.length === 0) return []

      const { data, error } = await supabase
        .from('activity_log')
        .select('id, action, payload, created_at, actor:profiles(id, full_name, avatar_url)')
        .in('node_id', nodeIds)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
    enabled: !!containerId,
  })

export function useProjectActivity(containerId: string, limit?: number) {
  return useQuery(projectActivityQueryOptions(containerId, limit))
}

// Vista de carpeta/espacio: mismo criterio que projectActivityQueryOptions
// pero sobre TODOS los proyectos del subárbol (ver
// collectDescendantProjectIds en build-tree.ts), no uno solo.
export const subtreeActivityQueryOptions = (containerIds: string[], limit = 8) =>
  queryOptions({
    queryKey: ['activity', 'subtree', [...containerIds].sort(), limit] as const,
    queryFn: async (): Promise<ActivityEntry[]> => {
      if (containerIds.length === 0) return []
      const { data: memberships, error: membershipsError } = await supabase
        .from('node_memberships')
        .select('node_id')
        .in('container_id', containerIds)
      if (membershipsError) throw membershipsError
      const nodeIds = memberships.map((m) => m.node_id)
      if (nodeIds.length === 0) return []

      const { data, error } = await supabase
        .from('activity_log')
        .select('id, action, payload, created_at, actor:profiles(id, full_name, avatar_url)')
        .in('node_id', nodeIds)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
    enabled: containerIds.length > 0,
  })

export function useSubtreeActivity(containerIds: string[], limit?: number) {
  return useQuery(subtreeActivityQueryOptions(containerIds, limit))
}

// Ficha de persona: mismo `activity_log` y mismo shape que la actividad del
// workspace, pero filtrado por `actor_id`. No se reusa
// `workspaceActivityQueryOptions` filtrando en cliente porque ahí el `limit`
// se aplica en la base: pedir las últimas 10 del workspace y quedarse con las
// de una persona podría devolver cero aunque esa persona tenga historial.
export const personActivityQueryOptions = (workspaceId: string, userId: string, limit = 20) =>
  queryOptions({
    queryKey: ['activity', 'person', workspaceId, userId, limit] as const,
    queryFn: async (): Promise<WorkspaceActivityEntry[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select(
          `
          id, action, payload, created_at,
          actor:profiles(id, full_name, avatar_url),
          node:nodes ( id, title, memberships:node_memberships!node_memberships_node_id_fkey ( container_id ) )
        `,
        )
        .eq('workspace_id', workspaceId)
        .eq('actor_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as unknown as WorkspaceActivityEntry[]
    },
    enabled: !!workspaceId && !!userId,
  })
