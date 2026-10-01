import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { isToday, isTomorrow, parseISO } from 'date-fns'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder02Icon } from '@hugeicons/core-free-icons'
import { workspaceStatusesQueryOptions } from '@/features/projects/queries'
import { useSubtreeTasks } from '@/features/tasks/queries'
import { formatDeliveryState } from '@/features/tasks/delivery-state'
import { formatShortDate } from '@/lib/format-date'
import { isClosedStatus } from '@/features/projects/status-kind'
import { useWeekMilestones, type FocusTaskRow, type PendingReviewRow } from '@/features/home/queries'
import { getWeekDays, toDateKey } from '@/features/calendar/date-utils'
import { cn } from '@/lib/utils'

interface ListItem {
  projectId: string
  name: string
  mineCount: number
  next: { text: string; bad: boolean } | null
  done: number
  review: number
  todo: number
}

interface ActiveListsSectionProps {
  workspaceId: string
  openTasks: FocusTaskRow[]
  reviews: PendingReviewRow[]
  projectsById: Map<string, string>
}

function lowercaseFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)
}

// "Tus listas activas" (mockup https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy):
// SOLO los proyectos donde tengo tareas abiertas (no la grilla completa de
// espacios — eso ya está en Espacios/el panel). "Próximo" prioriza lo más
// urgente disponible en cada proyecto: vencida > te piden revisión > vence
// hoy > hito de la semana > próxima con fecha — mismo criterio de
// urgencia que ya separa los grupos de "Necesita tu acción". La barra de
// progreso SÍ es de TODAS las tareas del proyecto (no solo las mías): usa
// `useSubtreeTasks`, la misma query de "vista de carpeta/espacio" que ya
// trae tareas de varios proyectos en un solo viaje.
//
// Sin nombre de espacio bajo cada lista (a diferencia del mockup, que
// muestra "Crawford"/"Metlife" como subtítulo): mismo trimming que ya
// decidió la PR 1 — `projectsQueryOptions` no trae esa jerarquía y pedirla
// solo para acá no vale la pena.
export function ActiveListsSection({ workspaceId, openTasks, reviews, projectsById }: ActiveListsSectionProps) {
  const weekDays = useMemo(() => getWeekDays(new Date()), [])
  const { data: milestones } = useWeekMilestones(workspaceId, toDateKey(weekDays[0]), toDateKey(weekDays[6]))

  const activeProjectIds = useMemo(() => {
    const ids = new Set<string>()
    for (const t of openTasks) {
      if (t.projectId && !isClosedStatus(t.status?.status_kind)) ids.add(t.projectId)
    }
    return [...ids]
  }, [openTasks])

  const { data: allTasks } = useSubtreeTasks(activeProjectIds)
  const { data: statuses } = useQuery(workspaceStatusesQueryOptions(activeProjectIds))
  const statusKindById = useMemo(() => new Map((statuses ?? []).map((s) => [s.id, s.status_kind])), [statuses])

  const items = useMemo<ListItem[]>(() => {
    const byProject = new Map<string, FocusTaskRow[]>()
    for (const t of openTasks) {
      if (!t.projectId || isClosedStatus(t.status?.status_kind)) continue
      if (!byProject.has(t.projectId)) byProject.set(t.projectId, [])
      byProject.get(t.projectId)!.push(t)
    }

    const reviewsByProject = new Map<string, PendingReviewRow[]>()
    for (const r of reviews) {
      const pid = r.node?.memberships[0]?.container_id
      if (!pid) continue
      if (!reviewsByProject.has(pid)) reviewsByProject.set(pid, [])
      reviewsByProject.get(pid)!.push(r)
    }

    const milestonesByProject = new Map<string, { id: string; title: string; due_date: string }[]>()
    for (const m of milestones ?? []) {
      if (!m.projectId) continue
      if (!milestonesByProject.has(m.projectId)) milestonesByProject.set(m.projectId, [])
      milestonesByProject.get(m.projectId)!.push(m)
    }

    const progressByProject = new Map<string, { done: number; review: number; todo: number }>()
    for (const t of allTasks ?? []) {
      const kind = statusKindById.get(t.status_id ?? '')
      const bucket = kind === 'success' ? 'done' : kind === 'warning' ? 'review' : 'todo'
      const p = progressByProject.get(t.container_id) ?? { done: 0, review: 0, todo: 0 }
      p[bucket]++
      progressByProject.set(t.container_id, p)
    }

    const result: ListItem[] = []
    for (const [projectId, tasks] of byProject) {
      const name = projectsById.get(projectId) ?? 'Sin nombre'

      const overdue = tasks
        .filter((t) => formatDeliveryState(t.due_date, false, null)?.state === 'overdue')
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]
      const projectReview = (reviewsByProject.get(projectId) ?? [])[0]
      const dueToday = tasks.find((t) => formatDeliveryState(t.due_date, false, null)?.state === 'today')
      const milestone = (milestonesByProject.get(projectId) ?? []).sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
      const upcoming = tasks
        .filter((t) => formatDeliveryState(t.due_date, false, null)?.state === 'upcoming')
        .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]

      let next: ListItem['next'] = null
      if (overdue) {
        next = { text: `${overdue.title} · ${lowercaseFirst(formatDeliveryState(overdue.due_date, false, null)!.label)}`, bad: true }
      } else if (projectReview?.node) {
        next = { text: `${projectReview.node.title} · te piden revisión`, bad: false }
      } else if (dueToday) {
        next = { text: `${dueToday.title} · ${dueToday.due_time ? dueToday.due_time.slice(0, 5) : 'hoy'}`, bad: false }
      } else if (milestone) {
        const due = parseISO(milestone.due_date)
        const when = isToday(due) ? 'hoy' : isTomorrow(due) ? 'mañana' : formatShortDate(milestone.due_date)
        next = { text: `Hito ${when}: ${milestone.title}`, bad: false }
      } else if (upcoming?.due_date) {
        next = { text: `${upcoming.title} · ${formatShortDate(upcoming.due_date)}`, bad: false }
      }

      const progress = progressByProject.get(projectId) ?? { done: 0, review: 0, todo: 0 }
      result.push({ projectId, name, mineCount: tasks.length, next, ...progress })
    }
    return result
  }, [openTasks, reviews, milestones, allTasks, statusKindById, projectsById])

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Tus listas activas</h2>
        <span className="text-xs text-text-muted">solo donde tienes tareas abiertas, con cuántas son y qué vence primero</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-alt/40 px-4 py-6 text-center text-sm text-text-muted">
          No tienes tareas abiertas en ninguna lista.
        </p>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => {
            const total = item.done + item.review + item.todo
            const pct = total > 0 ? Math.round((item.done / total) * 100) : 0
            return (
              <Link
                key={item.projectId}
                to="/p/$projectId/list"
                params={{ projectId: item.projectId }}
                className="flex flex-col gap-1.5 rounded-lg px-1.5 py-2.5 not-first:border-t not-first:border-border hover:bg-surface-alt @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:gap-4"
              >
                <span className="flex min-w-0 items-center gap-2 @min-[640px]:basis-[2.2fr]">
                  <HugeiconsIcon icon={Folder02Icon} className="size-3.5 shrink-0 text-text-muted" />
                  <span className="truncate text-[13px] font-medium text-text">{item.name}</span>
                </span>

                <span className="text-xs text-text-secondary @min-[640px]:basis-[1fr]">
                  <b className="font-semibold text-text tabular-nums">{item.mineCount}</b> tuya{item.mineCount === 1 ? '' : 's'} abierta
                  {item.mineCount === 1 ? '' : 's'}
                </span>

                {item.next && (
                  <span className={cn('min-w-0 truncate text-xs @min-[640px]:basis-[2fr]', item.next.bad ? 'text-danger-text' : 'text-text-secondary')}>
                    {item.next.text}
                  </span>
                )}

                <span className="flex items-center gap-2 @min-[640px]:w-[140px] @min-[640px]:shrink-0">
                  <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-status-todo-bg">
                    {total > 0 && (
                      <>
                        <span className="block h-full bg-status-done" style={{ width: `${(item.done / total) * 100}%` }} />
                        <span className="block h-full bg-status-inreview" style={{ width: `${(item.review / total) * 100}%` }} />
                      </>
                    )}
                  </span>
                  <span className="w-8 shrink-0 text-right font-mono text-[11px] text-text-secondary">{pct}%</span>
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
