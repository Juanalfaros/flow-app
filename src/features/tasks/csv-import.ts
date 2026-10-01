import { supabase } from '@/lib/supabase'
import { PRIORITY_LABEL } from '@/features/tasks/priority'
import type { StatusSummary } from '@/features/projects/queries'

// Mismo orden de columnas que CSV_HEADER en csv-export.ts — es a
// propósito el mismo formato en los dos sentidos: exportar una lista,
// editarla en una planilla, y reimportarla.
export const IMPORT_CSV_HEADER = [
  'Título',
  'Estado',
  'Prioridad',
  'Asignados',
  'Etiquetas',
  'Fecha de inicio',
  'Fecha límite',
  'Hito',
]

export interface WorkspaceMemberOption {
  user_id: string
  full_name: string | null
}

export interface LabelOption {
  id: string
  name: string
}

export interface ImportRowResolution {
  raw: string[]
  title: string
  statusName: string
  statusId: string | null
  priority: string
  assigneeName: string
  assigneeId: string | null
  labelNames: string[]
  labelIds: string[]
  unmatchedLabels: string[]
  startDate: string | null
  dueDate: string | null
  isMilestone: boolean
}

const PRIORITY_LABEL_TO_VALUE: Record<string, string> = Object.fromEntries(
  Object.entries(PRIORITY_LABEL).map(([value, label]) => [label.toLowerCase(), value]),
)

// Resuelve cada fila contra lo que YA existe en este proyecto/workspace —
// no crea estados/etiquetas nuevos (evita ensuciar el workspace con typos
// del CSV, ver el comentario de 0065_import_tasks.sql). Corre client-side
// (no en la RPC) porque ImportTasksDialog necesita el resultado para
// pintar el preview "resuelto/no resuelto" ANTES de confirmar el import.
export function resolveImportRows(
  rows: string[][],
  statuses: StatusSummary[],
  members: WorkspaceMemberOption[],
  labels: LabelOption[],
): ImportRowResolution[] {
  return rows.map((raw) => {
    const [title = '', statusName = '', priorityLabel = '', assigneeNames = '', labelNamesRaw = '', startDate = '', dueDate = '', hito = ''] =
      raw

    const status = statuses.find((s) => s.name.toLowerCase() === statusName.trim().toLowerCase())
    const priority = PRIORITY_LABEL_TO_VALUE[priorityLabel.trim().toLowerCase()] ?? 'medium'

    // Solo el primer asignado: create_task_node (y por extensión
    // import_tasks) acepta un único assignee_id — asignar a los demás
    // requeriría un insert aparte en task_assignees por fila, fuera del
    // alcance de este v1 (mismo criterio de alcance acotado que el resto
    // de Importaciones).
    const firstAssigneeName = (assigneeNames.split(';')[0] ?? '').trim()
    const member = firstAssigneeName
      ? members.find((m) => (m.full_name ?? '').toLowerCase() === firstAssigneeName.toLowerCase())
      : undefined

    const labelNames = labelNamesRaw
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    const matchedLabels = labelNames
      .map((name) => labels.find((l) => l.name.toLowerCase() === name.toLowerCase()))
      .filter((l): l is LabelOption => !!l)
    const unmatchedLabels = labelNames.filter((name) => !labels.some((l) => l.name.toLowerCase() === name.toLowerCase()))

    return {
      raw,
      title: title.trim(),
      statusName: statusName.trim(),
      statusId: status?.id ?? null,
      priority,
      assigneeName: firstAssigneeName,
      assigneeId: member?.user_id ?? null,
      labelNames,
      labelIds: matchedLabels.map((l) => l.id),
      unmatchedLabels,
      startDate: startDate.trim() || null,
      dueDate: dueDate.trim() || null,
      isMilestone: ['sí', 'si'].includes(hito.trim().toLowerCase()),
    }
  })
}

export async function importTasksToProject(containerId: string, rows: ImportRowResolution[]): Promise<string[]> {
  const payload = rows.map((r) => ({
    title: r.title,
    status_id: r.statusId,
    priority: r.priority,
    assignee_id: r.assigneeId,
    label_ids: r.labelIds,
    start_date: r.startDate,
    due_date: r.dueDate,
    is_milestone: r.isMilestone,
  }))
  const { data, error } = await supabase.rpc('import_tasks', { p_container_id: containerId, p_rows: payload })
  if (error) throw error
  return data as string[]
}
