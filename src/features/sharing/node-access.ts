import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { nodeTreeQueryOptions } from '@/features/nodes/queries'

export interface NodeAccessRow {
  node_id: string
  subject_type: 'user' | 'team'
  subject_id: string
}

// Los accesos de UN nodo (espacio o proyecto — ver 0034_project_acl_data.sql,
// que generalizó `node_access` de "solo espacios" a cualquier nodo marcado
// `is_private`). No se cachean todos juntos porque esto solo se abre desde el
// diálogo de un nodo concreto — traer los accesos de todo el workspace para
// mostrar los de uno sería gastar egress en datos que nadie mira.
export const nodeAccessQueryOptions = (nodeId: string) =>
  queryOptions({
    queryKey: ['node-access', nodeId] as const,
    queryFn: async (): Promise<NodeAccessRow[]> => {
      const { data, error } = await supabase
        .from('node_access')
        .select('node_id, subject_type, subject_id')
        .eq('node_id', nodeId)
      if (error) throw error
      return data as NodeAccessRow[]
    },
    enabled: !!nodeId,
  })

export function useNodeAccess(nodeId: string) {
  return useQuery(nodeAccessQueryOptions(nodeId))
}

function describeAccessError(err: unknown): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined
  if (code === '42501') return 'Solo un administrador puede gestionar el acceso a este espacio o lista.'
  if (code === '23505') return 'Esa persona o equipo ya tiene acceso.'
  return 'No se pudo actualizar el acceso.'
}

/**
 * Marca un espacio o proyecto como privado o público.
 *
 * Al hacerlo privado, quien lo marca conserva el acceso por ser admin (ver
 * `can_access_node`), así que no hay riesgo de que alguien se deje afuera de
 * su propio nodo con un click.
 */
export function useSetNodePrivacyMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { nodeId: string; isPrivate: boolean }) => {
      const { error } = await supabase
        .from('nodes')
        .update({ is_private: vars.isPrivate })
        .eq('id', vars.nodeId)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      // El árbol del sidebar se rearma: si el nodo dejó de ser visible para
      // alguien, tiene que desaparecer sin recargar la página.
      queryClient.invalidateQueries({ queryKey: nodeTreeQueryOptions(workspaceId).queryKey })
      // Fase A (tareas privadas): el panel de detalle de una tarea cachea
      // `is_private` aparte del árbol (`taskDetailQueryOptions`, no lee de
      // ahí) — sin esto, el ícono de "Acceso y privacidad" quedaba
      // mostrando el estado viejo hasta cerrar y reabrir el panel. No-op
      // inofensivo para espacios/carpetas (no hay ninguna query bajo esa
      // key para esos ids).
      queryClient.invalidateQueries({ queryKey: ['task', vars.nodeId] })
    },
    onError: (err) => toast.error(describeAccessError(err)),
  })
}

export function useGrantNodeAccessMutation(nodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { subjectType: 'user' | 'team'; subjectId: string }) => {
      const { error } = await supabase
        .from('node_access')
        .insert({ node_id: nodeId, subject_type: vars.subjectType, subject_id: vars.subjectId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nodeAccessQueryOptions(nodeId).queryKey }),
    onError: (err) => toast.error(describeAccessError(err)),
  })
}

export function useRevokeNodeAccessMutation(nodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { subjectType: 'user' | 'team'; subjectId: string }) => {
      const { error } = await supabase
        .from('node_access')
        .delete()
        .eq('node_id', nodeId)
        .eq('subject_type', vars.subjectType)
        .eq('subject_id', vars.subjectId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: nodeAccessQueryOptions(nodeId).queryKey }),
    onError: (err) => toast.error(describeAccessError(err)),
  })
}
