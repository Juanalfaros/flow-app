import { supabase } from '@/lib/supabase'

// Las 4 RPCs (0056_templates.sql) hacen todo el trabajo pesado server-side
// (snapshot/instanciación con sus propios asserts de acceso) — acá solo
// las envuelve para que el resto del cliente no arme el payload de la RPC
// a mano en cada call site.

export async function saveTaskAsTemplate(taskId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('save_task_as_template', { p_task_id: taskId, p_name: name })
  if (error) throw error
  return data
}

export async function instantiateTaskTemplate(
  templateId: string,
  containerId: string,
  statusId: string,
  position: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('instantiate_task_template', {
    p_template_id: templateId,
    p_container_id: containerId,
    p_status_id: statusId,
    p_position: position,
  })
  if (error) throw error
  return data
}

export async function saveProjectAsTemplate(projectId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('save_project_as_template', { p_project_id: projectId, p_name: name })
  if (error) throw error
  return data
}

export async function instantiateProjectTemplate(
  templateId: string,
  spaceId: string,
  name: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('instantiate_project_template', {
    p_template_id: templateId,
    p_space_id: spaceId,
    p_name: name,
  })
  if (error) throw error
  return data
}

export async function renameTaskTemplate(templateId: string, name: string) {
  const { error } = await supabase.from('task_templates').update({ name }).eq('id', templateId)
  if (error) throw error
}

export async function deleteTaskTemplate(templateId: string) {
  const { error } = await supabase.from('task_templates').delete().eq('id', templateId)
  if (error) throw error
}

export async function renameProjectTemplate(templateId: string, name: string) {
  const { error } = await supabase.from('project_templates').update({ name }).eq('id', templateId)
  if (error) throw error
}

export async function deleteProjectTemplate(templateId: string) {
  const { error } = await supabase.from('project_templates').delete().eq('id', templateId)
  if (error) throw error
}
