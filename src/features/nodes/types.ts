import type { Database } from '@/types/database'

export type Json = Database['public']['Tables']['nodes']['Row']['custom_fields']
export type NodeType = 'space' | 'folder' | 'project' | 'task' | 'doc'

// La unión discriminada TaskNode/ProjectNode/SpaceNode/FolderNode/DocNode
// (+ AnyNode) vivía acá sin un solo consumidor: cada feature tipa contra
// `Database['public']['Tables']['nodes']['Row']` o contra su propio summary
// (TaskSummary, FavoriteNodeRow, …). Se eliminó — reintroducirla cuando haya
// código que realmente estreche por `type`.

function isJsonObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getCustomFieldString(fields: Json, key: string): string | null {
  if (!isJsonObject(fields)) return null
  const v = fields[key]
  return typeof v === 'string' ? v : null
}

// Ícono/color/imagen personalizados de un nodo (hoy solo Espacios, ver
// SpaceIconDialog.tsx). Vive bajo `custom_fields.appearance` — esa columna
// jsonb ya existe y hoy solo la usan las tareas para campos custom
// arbitrarios (claves planas), así que `appearance` como key propia no
// colisiona con nada. Unión discriminada por `kind` para que nunca quede
// un estado ambiguo a medio setear (elegir un preset limpia `imageUrl` y
// viceversa).
export type NodeAppearance =
  | { kind: 'preset'; icon: string; color: string }
  | { kind: 'image'; imageUrl: string }

export function getNodeAppearance(fields: Json): NodeAppearance | null {
  if (!isJsonObject(fields)) return null
  const a = fields.appearance
  return a !== undefined && isJsonObject(a) ? (a as unknown as NodeAppearance) : null
}
