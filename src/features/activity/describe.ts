import type { ActivityEntry } from '@/features/activity/queries'

interface TaskSnapshot {
  title: string
  description: string | null
  status_id: string | null
  assignee_id: string | null
  priority: string
  due_date: string | null
  start_date: string | null
  is_milestone: boolean
}

export interface ActivityContext {
  statusesById: Map<string, { name: string }>
  membersById: Map<string, { full_name: string | null }>
}

// `entry.actor` viene `null` cuando `activity_log.actor_id` es NULL en la
// fila — algo real, no un fallo de RLS ni de la query (ambos verificados
// contra la base real: la policy `profiles_select_workspace_peers` está
// desplegada y funciona, y esto pasa también con filas propias). La causa
// genuina es que el trigger captura `auth.uid()` al momento del INSERT/UPDATE
// sobre `nodes`, y eso es NULL cuando la fila se escribió por fuera de una
// sesión de usuario (una carga de datos semilla por SQL directo, o en el
// futuro una importación masiva) — no hay ningún actor humano que nombrar,
// así que decir "Alguien" atribuye la acción a una persona no identificada en
// vez de a ninguna. Voz pasiva en cada rama, en vez de un solo fallback de
// nombre, para no repetir "Se hizo/creó/actualizó/eliminó" como prefijo fijo.
export function describeActivity(entry: ActivityEntry, ctx: ActivityContext): string {
  const actor = entry.actor?.full_name ?? null

  switch (entry.action) {
    case 'task_created':
      return actor ? `${actor} creó la tarea` : 'Se creó la tarea'
    case 'task_deleted':
      return actor ? `${actor} eliminó la tarea` : 'Se eliminó la tarea'
    case 'task_updated': {
      const payload = entry.payload as unknown as { before: TaskSnapshot; after: TaskSnapshot }
      const { before, after } = payload
      const changes: string[] = []

      if (before.status_id !== after.status_id) {
        const fromName = before.status_id ? (ctx.statusesById.get(before.status_id)?.name ?? '—') : '—'
        const toName = after.status_id ? (ctx.statusesById.get(after.status_id)?.name ?? '—') : '—'
        changes.push(`cambió el estado de "${fromName}" a "${toName}"`)
      }
      if (before.assignee_id !== after.assignee_id) {
        const toName = after.assignee_id
          ? (ctx.membersById.get(after.assignee_id)?.full_name ?? 'alguien')
          : 'nadie'
        changes.push(`reasignó a ${toName}`)
      }
      if (before.priority !== after.priority) {
        changes.push(`cambió la prioridad a ${after.priority}`)
      }
      if (before.due_date !== after.due_date) {
        changes.push(`cambió la fecha a ${after.due_date ?? 'sin fecha'}`)
      }
      // Estos 4 cuadraban antes en el fallback genérico ("actualizó la
      // tarea", sin ningún detalle) — la información ya venía en el
      // payload (to_jsonb(new)/(old) captura la fila completa, ver
      // log_node_activity, 0008), solo faltaba leerla. Reportado por el
      // usuario: una tarea de un día ya acumulaba media docena de líneas
      // sin ninguna información.
      if (before.title !== after.title) {
        changes.push(`cambió el título a "${after.title}"`)
      }
      if (before.description !== after.description) {
        changes.push('editó la descripción')
      }
      if (before.start_date !== after.start_date) {
        changes.push(`cambió la fecha de inicio a ${after.start_date ?? 'sin fecha'}`)
      }
      if (before.is_milestone !== after.is_milestone) {
        changes.push(after.is_milestone ? 'marcó la tarea como hito' : 'quitó el hito')
      }

      if (changes.length === 0) return actor ? `${actor} actualizó la tarea` : 'Se actualizó la tarea'
      // "Se " + "cambió el estado…"/"reasignó a…" da voz pasiva correcta para
      // cada fragmento individual ("Se cambió el estado de X a Y"). Con más
      // de un cambio a la vez el "se" no se repite por cláusula — lectura
      // levemente informal, pero el caso real (una fila semilla con varios
      // campos tocados a la vez) es poco frecuente.
      return actor ? `${actor} ${changes.join(', ')}` : `Se ${changes.join(', ')}`
    }
    // Entrada propia además del 'task_updated' genérico que el cambio de
    // estado del padre ya deja — esa no distingue "solo cambié el
    // estado" de "cambié el estado Y de paso resolví N subtareas"
    // (decisión de producto: "Cerrar con subtareas abiertas").
    case 'subtasks_closed': {
      const payload = entry.payload as unknown as {
        completed?: { id: string; title: string }[]
        dropped?: { id: string; title: string }[]
      }
      const completedCount = payload.completed?.length ?? 0
      const droppedCount = payload.dropped?.length ?? 0
      const parts: string[] = []
      if (completedCount > 0) parts.push(`${completedCount} subtarea${completedCount === 1 ? '' : 's'} completada${completedCount === 1 ? '' : 's'}`)
      if (droppedCount > 0) parts.push(`${droppedCount} descartada${droppedCount === 1 ? '' : 's'}`)
      if (parts.length === 0) return actor ? `${actor} cerró la tarea` : 'Se cerró la tarea'
      return actor ? `${actor} cerró la tarea (${parts.join(', ')})` : `Se cerró la tarea (${parts.join(', ')})`
    }
    default:
      return actor ? `${actor} hizo un cambio` : 'Hubo un cambio'
  }
}
