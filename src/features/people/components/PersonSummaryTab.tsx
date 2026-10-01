import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { addDays, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { myTasksQueryOptions } from '@/features/tasks/queries'
import { isClosedStatus } from '@/features/projects/status-kind'
import { formatDueDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import type { Person } from '@/features/people/queries'

const DUE_SOON_LIMIT = 5
const DUE_SOON_WINDOW_DAYS = 7

/**
 * Pestaña Resumen (rediseño de Equipo, 2026-09-24) — cadena de reporte y
 * lo que vence esta semana, en una sola vista. No es una query nueva:
 * `people` ya trae `manager_id` para toda la lista (queries.ts), y
 * `myTasksQueryOptions` ya se usa en PersonTasksTab — acá se reusa la
 * misma cache, solo se filtra distinto (una ventana de 7 días en vez de
 * los baldes de "Mis tareas").
 */
export function PersonSummaryTab({
  workspaceId,
  person,
  people,
  onOpenTasks,
}: {
  workspaceId: string
  person: Person
  people: Person[]
  onOpenTasks: () => void
}) {
  const { data: tasks, isPending } = useQuery(myTasksQueryOptions(workspaceId, person.id))

  const manager = person.manager_id ? people.find((p) => p.id === person.manager_id) : undefined
  const reports = useMemo(() => people.filter((p) => p.manager_id === person.id), [people, person.id])

  const dueSoon = useMemo(() => {
    const cutoff = addDays(new Date(), DUE_SOON_WINDOW_DAYS)
    return (tasks ?? [])
      .filter((t) => !isClosedStatus(t.status?.status_kind) && t.due_date && parseISO(t.due_date) <= cutoff)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
      .slice(0, DUE_SOON_LIMIT)
  }, [tasks])

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-text-muted">Reporta a</dt>
        <dd>{manager?.full_name ?? '—'}</dd>
        <dt className="text-text-muted">A cargo de</dt>
        <dd>{reports.length > 0 ? reports.map((r) => r.full_name ?? 'Sin nombre').join(', ') : '—'}</dd>
      </dl>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[10.5px] font-medium tracking-wide text-text-muted uppercase">Vence esta semana</h3>
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={onOpenTasks}>
            Ver todas
          </Button>
        </div>
        {isPending ? (
          <div className="flex flex-col gap-1.5">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : dueSoon.length === 0 ? (
          <p className="text-xs text-text-muted">Nada vence en los próximos {DUE_SOON_WINDOW_DAYS} días.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {dueSoon.map((task) => {
              const due = formatDueDate(task.due_date!)
              return (
                <li key={task.id} className="flex items-center gap-2 py-1.5 text-xs">
                  {task.projectId ? (
                    <Link
                      to="/p/$projectId/t/$taskId"
                      params={{ projectId: task.projectId, taskId: task.id }}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {task.title}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-text-secondary">{task.title}</span>
                  )}
                  <span className={cn('shrink-0 whitespace-nowrap', due.state === 'overdue' ? 'text-danger' : 'text-text-muted')}>
                    {due.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
