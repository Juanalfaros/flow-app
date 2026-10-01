import { supabase } from '@/lib/supabase'

// `parentId` puede ser un space o un folder — la jerarquía admite
// anidamiento arbitrario (ver migración 0012, PLAN.md §4.1).
export async function createProjectWithDefaults(parentId: string, name: string) {
  const { data, error } = await supabase.rpc('create_project_with_defaults', {
    p_parent_id: parentId,
    p_name: name,
  })
  if (error) throw error
  return data // uuid del proyecto
}

// `projects` era su propia tabla con columna `name` — ahora es un nodo
// (`nodes.title`, ver PLAN.md §4.1). El parámetro se mantiene "name" acá
// porque conceptualmente sigue siendo el nombre del proyecto.
export async function updateProjectName(projectId: string, name: string) {
  const { error } = await supabase.from('nodes').update({ title: name }).eq('id', projectId)
  if (error) throw error
}

// `nodes.description` (0008_nodes_engine.sql) — se pedía en
// projectQueryOptions recién como parte de la pestaña "Resumen"; hasta
// acá no había ningún lugar donde editarla para un proyecto.
export async function updateProjectDescription(projectId: string, description: string) {
  const { error } = await supabase.from('nodes').update({ description }).eq('id', projectId)
  if (error) throw error
}

export async function createStatus(
  projectId: string,
  name: string,
  statusKind: string,
  position: number,
) {
  const { data, error } = await supabase
    .from('statuses')
    .insert({ project_id: projectId, name, status_kind: statusKind, position })
    .select('id, project_id, name, status_kind, position, is_default')
    .single()
  if (error) throw error
  return data
}

export async function updateStatus(
  statusId: string,
  fields: { name?: string; status_kind?: string },
) {
  const { error } = await supabase.from('statuses').update(fields).eq('id', statusId)
  if (error) throw error
}

export async function deleteStatus(statusId: string) {
  const { error } = await supabase.from('statuses').delete().eq('id', statusId)
  if (error) throw error
}

// Proyecto vacío (sin tareas) o ya vaciado por `moveProjectTasks`: DELETE
// simple. Borrar un project ya NO cascadea sus tareas (esa cascada vivía
// en la FK `tasks.project_id`, que no existe más — ver PLAN.md §4.2). Si
// el proyecto todavía tiene tareas y el usuario elige "eliminar todo",
// usar `deleteProjectWithTasks`, nunca este.
export async function deleteProject(projectId: string) {
  const { error } = await supabase.from('nodes').delete().eq('id', projectId)
  if (error) throw error
}

// Único camino soportado para "eliminar proyecto y sus tareas" — la RPC
// borra primero los nodos que son miembros de `node_memberships` de este
// contenedor, después el proyecto (ver PLAN.md §4.2/§4.4).
export async function deleteProjectWithTasks(projectId: string) {
  const { error } = await supabase.rpc('delete_project_with_tasks', { p_project_id: projectId })
  if (error) throw error
}

// Mueve TODAS las tareas (top-level, vía node_memberships) de un
// contenedor a otro y reasigna status_id al default del destino — ahora
// vía RPC transaccional (antes era un UPDATE directo de cliente sobre
// `tasks.project_id`, columna que ya no existe). Ver PLAN.md §4.4.
export async function moveProjectTasks(fromProjectId: string, toProjectId: string, toStatusId: string) {
  const { error } = await supabase.rpc('move_project_tasks', {
    p_from_project_id: fromProjectId,
    p_to_project_id: toProjectId,
    p_to_status_id: toStatusId,
  })
  if (error) throw error
}

export async function reorderStatuses(updates: { id: string; position: number }[]) {
  // statuses.position es int y se reordena poco frecuentemente: se
  // recalculan todas las posiciones como enteros consecutivos en un
  // batch de updates, sin indexación fraccional (no vale la pena la
  // complejidad de between() para ~3-6 filas).
  await Promise.all(
    updates.map(({ id, position }) =>
      supabase.from('statuses').update({ position }).eq('id', id).throwOnError(),
    ),
  )
}
