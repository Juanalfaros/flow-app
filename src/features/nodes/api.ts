import { supabase } from '@/lib/supabase'
import type { TreeNodeRow } from '@/features/nodes/queries'
import type { NodeAppearance } from '@/features/nodes/types'

export async function createFolder(workspaceId: string, parentId: string, title: string) {
  const { data, error } = await supabase
    .from('nodes')
    .insert({ workspace_id: workspaceId, parent_id: parentId, type: 'folder', title })
    .select('id, name:title, type, parent_id')
    .single()
  if (error) throw error
  return data as TreeNodeRow
}

// F-01: mismo patrón que createFolder — un espacio es solo un nodo sin
// `parent_id` (es la raíz del árbol, ver build-tree.ts). `space_id` e
// `is_private` los resuelve solo el trigger `set_node_space_id`
// (0028_space_acl_data.sql: "un espacio es su propia raíz"), no hace falta
// setearlos a mano acá.
export async function createSpace(workspaceId: string, title: string) {
  const { data, error } = await supabase
    .from('nodes')
    .insert({ workspace_id: workspaceId, parent_id: null, type: 'space', title })
    .select('id, name:title, type, parent_id')
    .single()
  if (error) throw error
  return data as TreeNodeRow
}

export async function renameFolder(folderId: string, title: string) {
  const { error } = await supabase.from('nodes').update({ title }).eq('id', folderId)
  if (error) throw error
}

// `nodes.description` es una columna genérica (0008_nodes_engine.sql), no
// exclusiva de `task`/`project` — la vista de carpeta/espacio (F5 #2.2)
// la usa igual que la pestaña "Resumen" de proyecto usa
// `updateProjectDescription`, pero sin acotarse a `type='project'`.
export async function updateNodeDescription(nodeId: string, description: string) {
  const { error } = await supabase.from('nodes').update({ description }).eq('id', nodeId)
  if (error) throw error
}

// Único camino soportado para "eliminar carpeta y su contenido" — igual
// que `deleteProjectWithTasks`, un DELETE directo sobre `nodes` cascadearía
// folders/projects hijos vía `parent_id on delete cascade` pero dejaría
// huérfanas las tareas de cada project descendiente (viven en
// `node_memberships`, no bajo `parent_id`). Ver migración 0012.
export async function deleteFolderWithContents(folderId: string) {
  const { error } = await supabase.rpc('delete_folder_with_contents', { p_folder_id: folderId })
  if (error) throw error
}

// Archivar/Archivados (0061_node_archiving.sql) — mismo recorrido
// recursivo por `parent_id` que delete_folder_with_contents, pero
// reversible: archive_node/unarchive_node solo tocan `archived_at`, nunca
// borran filas.
export async function archiveNode(nodeId: string) {
  const { error } = await supabase.rpc('archive_node', { p_node_id: nodeId })
  if (error) throw error
}

export async function unarchiveNode(nodeId: string) {
  const { error } = await supabase.rpc('unarchive_node', { p_node_id: nodeId })
  if (error) throw error
}

// Reparenta cualquier folder/project bajo otro space/folder. El chequeo de
// ciclos (¿newParentId desciende de nodeId?) se hace antes de llamar acá,
// client-side contra el árbol cacheado (ver build-tree.ts) — este UPDATE
// confía en que el caller ya validó.
export async function moveNode(nodeId: string, newParentId: string) {
  const { error } = await supabase.from('nodes').update({ parent_id: newParentId }).eq('id', nodeId)
  if (error) throw error
}

// El caller siempre arma el objeto `appearance` completo (el diálogo tiene
// el estado actual en memoria) — overwrite simple, no un merge parcial en
// SQL. Ver types.ts (NodeAppearance) para por qué vive bajo esa key.
export async function updateNodeAppearance(nodeId: string, appearance: NodeAppearance) {
  const { error } = await supabase.from('nodes').update({ custom_fields: { appearance } }).eq('id', nodeId)
  if (error) throw error
}

// Calca uploadAvatar (src/features/profile/api.ts) — path estable
// `{nodeId}/icon.{ext}` con `upsert: true` en vez de acumular archivos
// huérfanos, y el mismo bust de cache `?t=` en la URL pública. La policy
// del bucket `node-icons` (0014_node_icons_storage.sql) es por membresía
// de workspace del nodo, no por dueño individual como en avatars.
export async function uploadNodeIcon(nodeId: string, file: File) {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${nodeId}/icon.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('node-icons')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('node-icons').getPublicUrl(path)
  const imageUrl = `${data.publicUrl}?t=${Date.now()}`

  await updateNodeAppearance(nodeId, { kind: 'image', imageUrl })
  return imageUrl
}

// Duplicar espacio (0062_duplicate_space.sql) — clona la estructura
// completa (folders/proyectos/estados/campos personalizados + tareas base)
// del lado del servidor; devuelve el id del espacio nuevo para navegar ahí.
export async function duplicateSpace(spaceId: string, newName: string) {
  const { data, error } = await supabase.rpc('duplicate_space', { p_space_id: spaceId, p_new_name: newName })
  if (error) throw error
  return data as string
}
