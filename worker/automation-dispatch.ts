import type { Env } from './index'
import { adminClient } from './notification-payload'

// Tope de IDs por llamada a `.in()`: PostgREST serializa la lista entera
// en la query string, y con unos pocos miles de UUIDs (todas las tareas
// de todos los proyectos con una regla `due_reminder` activa, directa o
// heredada de un espacio) la URL supera los límites del proxy y la
// consulta falla con 414, en silencio para quien esperaba el
// recordatorio. El resto de este archivo (Fase 3, 0069) ya tiene topes
// explícitos (reclamo atómico, filtro de proyectos activos); esta era la
// ruta que quedaba sin acotar (auditoría de seguridad 2026-09-16, B3).
const IN_CLAUSE_BATCH_SIZE = 200

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Recordatorio de vencimiento (Automatizaciones, 0063_automation_rules.sql)
// — la única de las 4 reglas que no dispara desde un trigger de Postgres:
// este repo no tiene pg_cron, así que corre desde el cron diario de
// Cloudflare (wrangler.jsonc) igual que el barrido de push
// (push-dispatch.ts). "Al día siguiente" es un aviso único, no un
// recordatorio diario — por eso filtra due_date = ayer exacto, no
// "cualquier tarea vencida".
//
// Reclama ANTES de notificar (no al final, como antes): el UPDATE de
// abajo marca due_reminder_sent_at con un `WHERE ... IS NULL` como
// condición de carrera optimista — solo devuelve (RETURNING) las tareas
// que ESTA corrida logró reclamar. Si dos corridas del cron se
// superponen (raro pero posible en Cloudflare, mismo criterio documentado
// en push-dispatch.ts), la segunda ya no encuentra esas filas sin marcar
// y no las reclama, así que nunca notifica dos veces. Con el orden viejo
// (notificar, marcar al final) esa misma ventana solapada podía dejar
// pasar a ambas corridas antes de que cualquiera marcara nada.
export async function sweepDueReminders(env: Env): Promise<void> {
  const client = adminClient(env)

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)

  const { data: rules, error: rulesError } = await client
    .from('automation_rules')
    .select('project_id')
    .eq('kind', 'due_reminder')
    .eq('enabled', true)
  if (rulesError) {
    console.error('sweepDueReminders: automation_rules query failed:', rulesError.message)
    return
  }
  const ruleNodeIds = [...new Set((rules ?? []).map((r) => r.project_id as string))]
  if (ruleNodeIds.length === 0) return

  // `project_id` de una regla due_reminder ahora puede ser un proyecto O
  // un espacio (0074_space_level_automations.sql: una regla de espacio
  // aplica a CUALQUIER proyecto de ese espacio, incluidos los creados
  // después). Se resuelve a la lista final de proyectos "activos" antes
  // de seguir con el resto de siempre — un proyecto archivado no debe
  // generar recordatorios aunque su regla (directa o heredada del
  // espacio) siga `enabled`.
  const { data: ruleNodes, error: ruleNodesError } = await client
    .from('nodes')
    .select('id, type, archived_at')
    .in('id', ruleNodeIds)
  if (ruleNodesError) {
    console.error('sweepDueReminders: nodes (rule targets) query failed:', ruleNodesError.message)
    return
  }

  const directProjectIds = (ruleNodes ?? [])
    .filter((n) => n.type === 'project' && n.archived_at === null)
    .map((n) => n.id as string)
  const ruledSpaceIds = (ruleNodes ?? []).filter((n) => n.type === 'space').map((n) => n.id as string)

  let spaceProjectIds: string[] = []
  if (ruledSpaceIds.length > 0) {
    const { data: spaceProjects, error: spaceProjectsError } = await client
      .from('nodes')
      .select('id')
      .in('space_id', ruledSpaceIds)
      .eq('type', 'project')
      .is('archived_at', null)
    if (spaceProjectsError) {
      console.error('sweepDueReminders: nodes (space projects) query failed:', spaceProjectsError.message)
      return
    }
    spaceProjectIds = (spaceProjects ?? []).map((p) => p.id as string)
  }

  const projectIds = [...new Set([...directProjectIds, ...spaceProjectIds])]
  if (projectIds.length === 0) return

  // node_memberships (no `nodes.parent_id`) es donde vive la relación
  // tarea → proyecto — mismo motivo por el que el resto de este archivo
  // de Automatizaciones (0063) tampoco usa parent_id para esto.
  const { data: memberships, error: nmError } = await client
    .from('node_memberships')
    .select('node_id')
    .in('container_id', projectIds)
  if (nmError) {
    console.error('sweepDueReminders: node_memberships query failed:', nmError.message)
    return
  }
  const nodeIds = (memberships ?? []).map((m) => m.node_id as string)
  if (nodeIds.length === 0) return

  type TaskRow = { id: string; workspace_id: string; due_date: string; created_by: string | null }
  const tasks: TaskRow[] = []
  for (const batch of chunk(nodeIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await client
      .from('nodes')
      .select('id, workspace_id, due_date, created_by')
      .in('id', batch)
      .eq('type', 'task')
      .is('completed_at', null)
      .is('due_reminder_sent_at', null)
      .eq('due_date', yesterdayStr)
    if (error) {
      console.error('sweepDueReminders: nodes query failed:', error.message)
      return
    }
    tasks.push(...((data ?? []) as TaskRow[]))
  }
  if (tasks.length === 0) return

  const candidateIds = tasks.map((t) => t.id)

  // Reclamo atómico: solo las filas que SIGAN con due_reminder_sent_at
  // NULL en este instante se marcan y se devuelven — una corrida
  // superpuesta que llegue después ya no las va a encontrar. Cada UPDATE
  // en lotes sigue siendo atómico por su cuenta; batchear no debilita la
  // garantía, cada fila solo puede quedar reclamada por el UPDATE que la
  // encuentre todavía en NULL, sin importar en cuántas llamadas se
  // partió la lista de candidatos.
  const claimedTasks: TaskRow[] = []
  for (const batch of chunk(candidateIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await client
      .from('nodes')
      .update({ due_reminder_sent_at: todayStr })
      .in('id', batch)
      .is('due_reminder_sent_at', null)
      .select('id, workspace_id, due_date, created_by')
    if (error) {
      console.error('sweepDueReminders: claim update failed:', error.message)
      return
    }
    claimedTasks.push(...((data ?? []) as TaskRow[]))
  }
  if (claimedTasks.length === 0) return

  const taskIds = claimedTasks.map((t) => t.id)
  const assignees: { node_id: string; user_id: string }[] = []
  for (const batch of chunk(taskIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await client.from('task_assignees').select('node_id, user_id').in('node_id', batch)
    if (error) {
      // Las tareas ya quedaron reclamadas (due_reminder_sent_at marcado)
      // pero sin poder resolver a quién avisar — mejor perder este batch
      // de recordatorios que, al no chequear este error como antes,
      // marcar igual sin haber avisado a nadie y sin que quede registro
      // del fallo.
      console.error('sweepDueReminders: task_assignees query failed, batch abortado:', error.message)
      return
    }
    assignees.push(...((data ?? []) as { node_id: string; user_id: string }[]))
  }

  const assigneesByTask = new Map<string, string[]>()
  for (const a of assignees ?? []) {
    const list = assigneesByTask.get(a.node_id as string) ?? []
    list.push(a.user_id as string)
    assigneesByTask.set(a.node_id as string, list)
  }

  for (const task of claimedTasks) {
    // D2 ("Quién queda a cargo al crear", A6): "responsable es quien se
    // come el recordatorio, no quien figura en un campo" — sin nadie
    // asignado, el aviso de vencimiento le llega a quien la pidió
    // (created_by) en vez de perderse en silencio.
    const recipients = assigneesByTask.get(task.id as string) ?? []
    const createdBy = task.created_by as string | null
    const finalRecipients = recipients.length > 0 ? recipients : createdBy ? [createdBy] : []
    for (const userId of finalRecipients) {
      const { error: insertError } = await client.from('notifications').insert({
        workspace_id: task.workspace_id as string,
        recipient_id: userId,
        actor_id: null,
        node_id: task.id as string,
        type: 'due_reminder',
        payload: { due_date: task.due_date },
      })
      if (insertError) console.error('sweepDueReminders: notification insert failed:', insertError.message)
    }
  }
}
