import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/features/nodes/types'

// Nivel 2 de la auditoría de campos personalizados (0079_custom_field_types_extended.sql):
// url/email/phone/longText son texto (jsonb string, igual validación que
// 'text' del lado del servidor); money es número (igual que 'number').
// Ningún tipo nuevo tiene forma propia — todos calzan en uno de los 2
// tipos jsonb que ya existían.
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'url' | 'money' | 'longText' | 'email' | 'phone'

// Única fuente de verdad — antes vivía duplicada como const local en
// CustomFieldDefinitionDialog.tsx; CustomFieldsManagerPage.tsx (Nivel 3)
// también la necesita, para el filtro por tipo y los encabezados de grupo.
export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: 'Texto',
  longText: 'Área de texto',
  number: 'Número',
  money: 'Dinero',
  date: 'Fecha',
  select: 'Opción única',
  checkbox: 'Casillero',
  url: 'Sitio web',
  email: 'Correo electrónico',
  phone: 'Teléfono',
}

export interface CustomFieldOption {
  id: string
  label: string
  color: string | null
}

export interface CustomFieldDefinition {
  id: string
  project_id: string
  name: string
  field_type: CustomFieldType
  options: CustomFieldOption[] | null
  position: number
  // Solo la usa el Gestor de campos personalizados (Nivel 3) — el resto de
  // los call-sites (CustomFieldDefinitionDialog, CustomFieldInputs) nunca
  // la necesitaron, pero pedirla acá siempre es más simple que 2 selects
  // distintos para la misma tabla.
  created_at: string
}

const CUSTOM_FIELD_SELECT = 'id, project_id, name, field_type, options, position, created_at'

export const projectCustomFieldsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ['project-custom-fields', projectId] as const,
    queryFn: async (): Promise<CustomFieldDefinition[]> => {
      const { data, error } = await supabase
        .from('project_custom_fields')
        .select(CUSTOM_FIELD_SELECT)
        .eq('project_id', projectId)
        .order('position', { ascending: true })
      if (error) throw error
      return data as unknown as CustomFieldDefinition[]
    },
    enabled: !!projectId,
  })

export function useProjectCustomFields(projectId: string) {
  return useQuery(projectCustomFieldsQueryOptions(projectId))
}

// Gestor de campos personalizados (Nivel 3) — a diferencia de
// projectCustomFieldsQueryOptions (un solo proyecto), acá `locationIds` es
// TODO nodo type IN ('project','space') del workspace (space: plantillas
// compartidas, 0073_space_level_fields.sql) — el árbol ya resuelto
// (useNodeTree) es quien se los pasa, mismo criterio que
// workspaceStatusesQueryOptions (projects/queries.ts).
export const workspaceCustomFieldsQueryOptions = (locationIds: string[]) =>
  queryOptions({
    queryKey: ['project-custom-fields', 'workspace', locationIds] as const,
    queryFn: async (): Promise<CustomFieldDefinition[]> => {
      if (locationIds.length === 0) return []
      const { data, error } = await supabase
        .from('project_custom_fields')
        .select(CUSTOM_FIELD_SELECT)
        .in('project_id', locationIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as CustomFieldDefinition[]
    },
    enabled: locationIds.length > 0,
  })

export function useWorkspaceCustomFields(locationIds: string[]) {
  return useQuery(workspaceCustomFieldsQueryOptions(locationIds))
}

export interface TaskCustomFieldValueRow {
  field_id: string
  value: Json
}

export const taskCustomFieldValuesQueryOptions = (taskId: string) =>
  queryOptions({
    queryKey: ['task-custom-field-values', taskId] as const,
    queryFn: async (): Promise<TaskCustomFieldValueRow[]> => {
      const { data, error } = await supabase
        .from('task_custom_field_values')
        .select('field_id, value')
        .eq('node_id', taskId)
      if (error) throw error
      return data
    },
    enabled: !!taskId,
  })

export function useTaskCustomFieldValues(taskId: string) {
  return useQuery(taskCustomFieldValuesQueryOptions(taskId))
}

export interface ProjectTaskCustomFieldValueRow {
  node_id: string
  field_id: string
  value: Json
}

// F5 #4 (vista Tabla): `taskCustomFieldValuesQueryOptions` de arriba es
// una query POR TAREA — hecha para el panel de detalle, donde solo hace
// falta una. Una grilla con N tareas necesita esto en UNA sola consulta
// (`node_id in (...)`), no N — `projectId` viaja en la key para poder
// invalidar por proyecto más adelante si hiciera falta, aunque el filtro
// real sea por `taskIds`.
export const projectTaskCustomFieldValuesQueryOptions = (projectId: string, taskIds: string[]) =>
  queryOptions({
    queryKey: ['project-task-custom-field-values', projectId, taskIds] as const,
    queryFn: async (): Promise<ProjectTaskCustomFieldValueRow[]> => {
      if (taskIds.length === 0) return []
      const { data, error } = await supabase
        .from('task_custom_field_values')
        .select('node_id, field_id, value')
        .in('node_id', taskIds)
      if (error) throw error
      return data
    },
    enabled: taskIds.length > 0,
  })

export function useProjectTaskCustomFieldValues(projectId: string, taskIds: string[]) {
  return useQuery(projectTaskCustomFieldValuesQueryOptions(projectId, taskIds))
}
