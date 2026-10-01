import type { ActivityEntry } from '@/features/activity/queries'

export type ActivityIconKind =
  | 'created'
  | 'deleted'
  | 'status'
  | 'assignee'
  | 'priority'
  | 'date'
  | 'generic'

interface TaskSnapshot {
  status_id: string | null
  assignee_id: string | null
  priority: string
  due_date: string | null
  start_date: string | null
}

// Qué ícono/color le corresponde a una entrada de activity_log, para la
// insignia sobre el avatar en ActivityFeed. Duplica una versión reducida
// de las comparaciones de describe.ts (que arma el TEXTO completo, con
// todos los cambios de la fila) a propósito: aquí solo importa el PRIMER
// cambio real para elegir un ícono, no la lista completa — mantenerlo
// separado evita forzar a describeActivity a exponer algo que no
// necesita para su propio trabajo.
export function activityIconKind(entry: ActivityEntry): ActivityIconKind {
  if (entry.action === 'task_created') return 'created'
  if (entry.action === 'task_deleted') return 'deleted'
  if (entry.action !== 'task_updated') return 'generic'

  const payload = entry.payload as unknown as { before: TaskSnapshot; after: TaskSnapshot }
  const { before, after } = payload
  if (before.status_id !== after.status_id) return 'status'
  if (before.assignee_id !== after.assignee_id) return 'assignee'
  if (before.priority !== after.priority) return 'priority'
  if (before.due_date !== after.due_date || before.start_date !== after.start_date) return 'date'
  return 'generic'
}
