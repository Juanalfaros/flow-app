import { supabase } from '@/lib/supabase'
import type { Json } from '@/features/nodes/types'
import type { CustomFieldDefinition, CustomFieldOption, CustomFieldType } from '@/features/custom-fields/queries'

// `options` viaja como `Json` en el insert/update (así lo tipa
// database.ts, generado desde la columna jsonb) y vuelve tipado a
// `CustomFieldOption[] | null` en la lectura — el cast es del lado del
// escritor/lector, no del dato: `CustomFieldOption` ya es un objeto plano
// JSON-serializable, solo le falta el índice de firma que pide `Json`.
export async function createCustomField(
  projectId: string,
  fields: { name: string; fieldType: CustomFieldType; options?: CustomFieldOption[] | null; position: number },
): Promise<CustomFieldDefinition> {
  const { data, error } = await supabase
    .from('project_custom_fields')
    .insert({
      project_id: projectId,
      name: fields.name,
      field_type: fields.fieldType,
      options: (fields.options ?? null) as Json,
      position: fields.position,
    })
    .select('id, project_id, name, field_type, options, position')
    .single()
  if (error) throw error
  return data as unknown as CustomFieldDefinition
}

export async function updateCustomField(
  fieldId: string,
  fields: { name?: string; options?: CustomFieldOption[] | null; position?: number },
) {
  const { error } = await supabase
    .from('project_custom_fields')
    .update({ ...fields, options: fields.options === undefined ? undefined : (fields.options as Json) })
    .eq('id', fieldId)
  if (error) throw error
}

export async function deleteCustomField(fieldId: string) {
  const { error } = await supabase.from('project_custom_fields').delete().eq('id', fieldId)
  if (error) throw error
}

// Sin RPC de escritura (patrón task_labels/task_dependencies): el cliente
// escribe directo y `validate_custom_field_value` (0049) valida el tipo
// desde el `with check` de la RLS.
export async function upsertCustomFieldValue(taskId: string, fieldId: string, value: Json) {
  const { error } = await supabase
    .from('task_custom_field_values')
    .upsert({ node_id: taskId, field_id: fieldId, value }, { onConflict: 'node_id,field_id' })
  if (error) throw error
}

export async function deleteCustomFieldValue(taskId: string, fieldId: string) {
  const { error } = await supabase
    .from('task_custom_field_values')
    .delete()
    .eq('node_id', taskId)
    .eq('field_id', fieldId)
  if (error) throw error
}
