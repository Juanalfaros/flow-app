import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json, NodeType } from '@/features/nodes/types'

export interface TreeNodeRow {
  id: string
  name: string
  type: NodeType
  parent_id: string | null
  custom_fields: Json
  // Significativo en `space` y `project` (0028/0034). El árbol lo trae para
  // poder mostrar el candado sin una query aparte por nodo — es un booleano
  // por fila, no encarece el payload.
  is_private: boolean
}

// Un solo round-trip trae todo lo que puede aparecer en el árbol del
// sidebar (space/folder/project) para un workspace — el árbol se arma
// client-side (ver build-tree.ts), mismo enfoque que ya usaba el
// agrupamiento plano de proyectos por space (Sidebar.tsx), generalizado a
// n niveles. `task`/`doc` quedan afuera a propósito: no son parte de esta
// jerarquía de navegación.
export const nodeTreeQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['node-tree', workspaceId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nodes')
        .select('id, name:title, type, parent_id, custom_fields, is_private')
        .eq('workspace_id', workspaceId)
        .in('type', ['space', 'folder', 'project'])
        // Archivar (0061_node_archiving.sql): el árbol normal nunca muestra
        // nodos archivados — /archivados es la única vista que sí los pide.
        .is('archived_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as TreeNodeRow[]
    },
    enabled: !!workspaceId,
  })

export function useNodeTree(workspaceId: string) {
  return useQuery(nodeTreeQueryOptions(workspaceId))
}

export interface ArchivedNodeRow {
  id: string
  name: string
  archived_at: string
  type: string
}

// Antes solo `type='space'` ("Archivar" únicamente ofrecido en el menú
// de un espacio, mismo alcance que "Ocultar espacio") — el backend
// (archive_node/unarchive_node, 0061/0067) siempre fue genérico por
// nodeId, sin restricción de tipo; era la UI la que nunca ofrecía
// "Archivar" para carpetas ni listas. Se generaliza a los 3 tipos.
//
// Filtro de "raíz" client-side (`parent_id` no está entre los
// archivados): archivar un espacio archiva todo su subárbol vía el
// recorrido recursivo por `parent_id` de la propia RPC — sin este
// filtro, archivar UN espacio con 10 carpetas y 20 listas mostraría acá
// 31 filas sueltas en vez de 1. Se muestra solo el nodo que de verdad se
// archivó a propósito; sus descendientes se restauran solos con él
// (mismo recorrido recursivo, unarchive_node).
export const archivedNodesQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['archived-nodes', workspaceId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nodes')
        .select('id, name:title, archived_at, type, parent_id')
        .eq('workspace_id', workspaceId)
        .in('type', ['space', 'folder', 'project'])
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      if (error) throw error
      const rows = data as (ArchivedNodeRow & { parent_id: string | null })[]
      const archivedIds = new Set(rows.map((r) => r.id))
      return rows.filter((r) => !r.parent_id || !archivedIds.has(r.parent_id))
    },
    enabled: !!workspaceId,
  })

export function useArchivedNodes(workspaceId: string) {
  return useQuery(archivedNodesQueryOptions(workspaceId))
}

// Consulta liviana de un solo nodo con su `description` — separada del
// árbol (nodeTreeQueryOptions) a propósito: ese query alimenta el
// Sidebar en cada página y no debe cargar HTML potencialmente largo por
// fila (mismo criterio que `includeDescription` en tasksQueryOptions).
export const nodeDetailQueryOptions = (nodeId: string) =>
  queryOptions({
    queryKey: ['node-detail', nodeId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from('nodes').select('id, title, description').eq('id', nodeId).single()
      if (error) throw error
      return data
    },
    enabled: !!nodeId,
  })

export function useNodeDetail(nodeId: string) {
  return useQuery(nodeDetailQueryOptions(nodeId))
}
