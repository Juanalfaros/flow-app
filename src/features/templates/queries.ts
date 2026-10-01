import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TaskTemplateSummary {
  id: string
  name: string
  title: string
}

export const taskTemplatesQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['task-templates', workspaceId] as const,
    queryFn: async (): Promise<TaskTemplateSummary[]> => {
      const { data, error } = await supabase
        .from('task_templates')
        .select('id, name, title')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

export function useTaskTemplates(workspaceId: string) {
  return useQuery(taskTemplatesQueryOptions(workspaceId))
}

export interface ProjectTemplateSummary {
  id: string
  name: string
  description: string | null
}

export const projectTemplatesQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['project-templates', workspaceId] as const,
    queryFn: async (): Promise<ProjectTemplateSummary[]> => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name, description')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

export function useProjectTemplates(workspaceId: string) {
  return useQuery(projectTemplatesQueryOptions(workspaceId))
}
