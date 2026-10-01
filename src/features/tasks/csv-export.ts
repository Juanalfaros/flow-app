import type { TaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'
import { PRIORITY_LABEL } from '@/features/tasks/priority'
import { rowsToCsv, downloadCsv } from '@/lib/csv'

const CSV_HEADER = [
  'Título',
  'Estado',
  'Prioridad',
  'Asignados',
  'Etiquetas',
  'Fecha de inicio',
  'Fecha límite',
  'Hito',
]

function taskToCsvRow(task: TaskSummary, statusesById: Map<string, StatusSummary>): string[] {
  return [
    task.title,
    task.status_id ? (statusesById.get(task.status_id)?.name ?? '') : '',
    PRIORITY_LABEL[task.priority] ?? task.priority,
    task.task_assignees
      .map((a) => a.assignee.full_name)
      .filter((name): name is string => !!name)
      .join('; '),
    task.task_labels.map((l) => l.label.name).join('; '),
    task.start_date ?? '',
    task.due_date ?? '',
    task.is_milestone ? 'Sí' : 'No',
  ]
}

// Caracteres inválidos en un nombre de archivo de Windows (el propio
// entorno de este proyecto) — un nombre de proyecto con "/" o ":" no
// puede ser directamente el nombre del .csv.
function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'lista'
}

/**
 * Exporta a CSV lo que la vista ya está mostrando — `tasks` llega
 * filtrado/ordenado por quien llama (list.tsx/board.tsx, vía
 * `useNodeViewController`), no un dump completo del proyecto sin importar
 * los filtros activos.
 */
export function exportTasksToCsv(projectName: string, tasks: TaskSummary[], statuses: StatusSummary[]) {
  const statusesById = new Map(statuses.map((s) => [s.id, s]))
  const rows = [CSV_HEADER, ...tasks.map((t) => taskToCsvRow(t, statusesById))]
  const date = new Date().toISOString().slice(0, 10)
  downloadCsv(`${sanitizeFilename(projectName)}-${date}.csv`, rowsToCsv(rows))
}
