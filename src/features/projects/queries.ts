import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type StatusSummary = Pick<
  Database['public']['Tables']['statuses']['Row'],
  'id' | 'project_id' | 'name' | 'status_kind' | 'position' | 'is_default'
>

// `projects` era su propia tabla — ahora son `nodes` con type='project'
// (ver PLAN.md §4.1). `workspace_id` es columna directa de `nodes`, así
// que el join de 2 hops contra `spaces` que hacía falta antes desaparece.
// `name:title` alias: todos los consumidores existentes (ProjectPageHeader,
// EditableProjectName, DeleteProjectDialog, board/list) siguen leyendo
// `.name` sin cambios. El padre (space o folder, jerarquía anidada) ya no
// se embebe acá — el sidebar lo obtiene de `nodeTreeQueryOptions`
// (src/features/nodes/queries.ts), que trae space/folder/project en un
// solo árbol.
export const projectsQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['projects', workspaceId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nodes')
        .select('id, name:title, created_at')
        .eq('workspace_id', workspaceId)
        .eq('type', 'project')
        // Mismo filtro que nodeTreeQueryOptions (0061): sin esto, un
        // proyecto archivado sigue totalmente interactivo en Tabla/
        // Calendario/Timeline globales, el Command Palette y los widgets
        // de home que consumen useProjects — contradice el propósito
        // mismo de "Archivar" (solo lo sacaba del árbol del sidebar).
        .is('archived_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

export function useProjects(workspaceId: string) {
  return useQuery(projectsQueryOptions(workspaceId))
}

export const projectQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ['project', projectId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nodes')
        .select('id, name:title, parent_id, description')
        .eq('id', projectId)
        .single()
      if (error) throw error
      return data
    },
    // Sin este guard (a diferencia de statusesQueryOptions más abajo, que sí
    // lo tiene): NodeDetailContent.tsx deriva `containerId` de la tarea
    // (`task?.memberships[0]?.container_id ?? ''`) y mientras `useTaskDetail`
    // sigue en vuelo esto es `''` — la query disparaba igual con
    // `.eq('id', '')`, un `id=eq.` vacío que PostgREST responde 400.
    enabled: !!projectId,
  })

export function useProject(projectId: string) {
  return useQuery(projectQueryOptions(projectId))
}

export const statusesQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ['statuses', projectId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuses')
        .select('id, project_id, name, status_kind, position, is_default')
        .eq('project_id', projectId)
        .order('position', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!projectId,
  })

export function useStatuses(projectId: string) {
  return useQuery(statusesQueryOptions(projectId))
}

// Home page "Actividad reciente": `statuses` es por proyecto, así que un
// feed cross-proyecto necesita resolver nombres de estado de varios
// proyectos a la vez para que `describeActivity` no caiga en el
// fallback '—' en cada cambio de estado.
export const workspaceStatusesQueryOptions = (projectIds: string[]) =>
  queryOptions({
    queryKey: ['statuses', 'workspace', projectIds] as const,
    queryFn: async (): Promise<StatusSummary[]> => {
      if (projectIds.length === 0) return []
      const { data, error } = await supabase
        .from('statuses')
        .select('id, project_id, name, status_kind, position, is_default')
        .in('project_id', projectIds)
      if (error) throw error
      return data
    },
    enabled: projectIds.length > 0,
  })
