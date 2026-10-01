import { useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon } from '@hugeicons/core-free-icons'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { initials } from '@/lib/initials'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { PRIORITY_DOT, PRIORITY_LABEL } from '@/features/tasks/priority'
import { formatDeliveryState } from '@/features/tasks/delivery-state'
import { isClosedStatus } from '@/features/projects/status-kind'
import { useMarkTaskDoneMutation, useRescheduleTomorrowMutation, useApproveReviewMutation } from '@/features/home/mutations'
import type { FocusTaskRow, PendingReviewRow, UnblockedRow } from '@/features/home/queries'
import type { TaskAssigneeSummary } from '@/features/tasks/queries'
import { cn } from '@/lib/utils'

const MAX_ASSIGNEE_AVATARS = 3

const GROUP_BADGE: Record<string, string> = {
  bad: 'bg-danger-bg text-danger-text',
  acc: 'bg-accent/15 text-accent-text-on-bg',
  info: 'bg-status-inreview-bg text-status-inreview',
  ok: 'bg-success-bg text-success-text',
}

interface Row {
  id: string
  taskId: string
  title: string
  priority: string
  subtitle: string
  when: string
  whenBad: boolean
  assignees: TaskAssigneeSummary[]
  projectId: string | null
  isReview: boolean
}

interface Group {
  key: string
  label: string
  badge: 'bad' | 'acc' | 'info' | 'ok'
  rows: Row[]
}

interface ActionNeededProps {
  workspaceId: string
  userId: string | undefined
  openTasks: FocusTaskRow[]
  reviews: PendingReviewRow[]
  unblocked: UnblockedRow[]
  projectsById: Map<string, string>
}

// "Necesita tu acción" (mockup https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy):
// 4 grupos planos en vez de las 4 fuentes (tareas vencidas/de-hoy, revisiones,
// desbloqueos) viviendo en widgets separados como antes — mismo diagnóstico
// que motivó el rediseño ("por qué esto, ahora, en una sola oración" en vez
// de 4 listas sueltas). `openTasks` ya trae TODAS mis tareas abiertas (igual
// que `myTasksQueryOptions`, sin filtro de estado en la query — se filtra acá
// con `isClosedStatus`, mismo patrón que MyWorkWidget/MyTasksSection).
export function ActionNeeded({ workspaceId, userId, openTasks, reviews, unblocked, projectsById }: ActionNeededProps) {
  const setNode = useSetNodeSearchParam()
  const markDoneMutation = useMarkTaskDoneMutation(workspaceId, userId ?? '')
  const rescheduleMutation = useRescheduleTomorrowMutation(workspaceId, userId ?? '')
  const approveMutation = useApproveReviewMutation(userId)

  const groups = useMemo<Group[]>(() => {
    const active = openTasks.filter((t) => !isClosedStatus(t.status?.status_kind))

    const overdue: Row[] = []
    const dueToday: Row[] = []
    for (const t of active) {
      const delivery = formatDeliveryState(t.due_date, false, null)
      if (!delivery) continue
      const projectName = t.projectId ? (projectsById.get(t.projectId) ?? null) : null
      const base = {
        id: t.id,
        taskId: t.id,
        title: t.title,
        priority: t.priority,
        subtitle: projectName ?? 'Sin lista',
        assignees: t.task_assignees,
        projectId: t.projectId,
        isReview: false,
      }
      if (delivery.state === 'overdue') {
        overdue.push({ ...base, when: lowercaseFirst(delivery.label), whenBad: true })
      } else if (delivery.state === 'today') {
        dueToday.push({ ...base, when: t.due_time ? t.due_time.slice(0, 5) : 'hoy', whenBad: false })
      }
    }
    dueToday.sort((a, b) => (a.when === 'hoy' ? 1 : 0) - (b.when === 'hoy' ? 1 : 0) || a.when.localeCompare(b.when))

    const reviewRows: Row[] = reviews
      .filter((r) => r.node)
      .map((r) => {
        const node = r.node!
        const projectId = node.memberships[0]?.container_id ?? null
        const projectName = projectId ? (projectsById.get(projectId) ?? null) : null
        return {
          id: r.id,
          taskId: node.id,
          title: node.title,
          priority: node.priority,
          subtitle: projectName ?? 'Revisión pendiente',
          when: formatDistanceToNowStrict(parseISO(r.created_at), { locale: es, addSuffix: true }),
          whenBad: true,
          assignees: [],
          projectId,
          isReview: true,
        }
      })

    const openById = new Map(active.map((t) => [t.id, t]))
    const seenUnblocked = new Set<string>()
    const unblockedRows: Row[] = []
    for (const u of unblocked) {
      const nodeId = u.node?.id
      if (!nodeId || seenUnblocked.has(nodeId)) continue
      const task = openById.get(nodeId)
      if (!task) continue
      seenUnblocked.add(nodeId)
      const projectName = task.projectId ? (projectsById.get(task.projectId) ?? null) : null
      unblockedRows.push({
        id: u.notificationId,
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        subtitle: u.actor?.full_name ? `${u.actor.full_name} destrabó esta tarea · ${projectName ?? 'Sin lista'}` : (projectName ?? 'Sin lista'),
        when: formatDistanceToNowStrict(parseISO(u.createdAt), { locale: es, addSuffix: true }),
        whenBad: false,
        assignees: task.task_assignees,
        projectId: task.projectId,
        isReview: false,
      })
    }

    const result: Group[] = []
    if (overdue.length > 0) result.push({ key: 'overdue', label: 'Vencidas', badge: 'bad', rows: overdue })
    if (dueToday.length > 0) result.push({ key: 'today', label: 'Vencen hoy', badge: 'acc', rows: dueToday })
    if (reviewRows.length > 0) result.push({ key: 'review', label: 'Te piden revisión', badge: 'info', rows: reviewRows })
    if (unblockedRows.length > 0) result.push({ key: 'unblocked', label: 'Ya puedes empezar', badge: 'ok', rows: unblockedRows })
    return result
  }, [openTasks, reviews, unblocked, projectsById])

  const total = groups.reduce((sum, g) => sum + g.rows.length, 0)

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Necesita tu acción</h2>
        {total > 0 && <span className="text-xs text-text-muted">{total} cosa{total === 1 ? '' : 's'}</span>}
        <Link to="/mis-tareas" className="ml-auto text-xs text-accent-text-on-bg hover:underline">
          Mis tareas →
        </Link>
      </div>

      {total === 0 ? (
        <p className="rounded-lg border border-border bg-surface-alt/40 px-4 py-6 text-center text-sm text-text-muted">
          Nada pendiente por ahora.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="flex flex-col">
            <div className="flex items-center gap-2 py-1 font-mono text-[10.5px] tracking-wide text-text-muted uppercase">
              {g.label}
              <span className={cn('rounded-full px-1.5 font-mono text-[10.5px]', GROUP_BADGE[g.badge])}>{g.rows.length}</span>
            </div>
            {g.rows.map((row) => (
              <ActionRow
                key={row.id}
                row={row}
                onOpen={() => setNode(row.taskId)}
                onToggleDone={
                  row.isReview || !row.projectId
                    ? undefined
                    : () => markDoneMutation.mutate({ taskId: row.taskId, projectId: row.projectId!, done: true })
                }
                onSnooze={row.isReview ? undefined : () => rescheduleMutation.mutate({ taskId: row.taskId, projectId: row.projectId })}
                onApprove={row.isReview ? () => approveMutation.mutate(row.taskId) : undefined}
              />
            ))}
          </div>
        ))
      )}
    </section>
  )
}

function ActionRow({
  row,
  onOpen,
  onToggleDone,
  onSnooze,
  onApprove,
}: {
  row: Row
  onOpen: () => void
  onToggleDone?: () => void
  onSnooze?: () => void
  onApprove?: () => void
}) {
  return (
    <div className="group/row grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-1.5 py-2 not-last:border-b not-last:border-border hover:bg-surface-alt">
      {row.isReview ? (
        <span />
      ) : (
        <button
          type="button"
          onClick={onToggleDone}
          aria-label={`Marcar ${row.title} como hecha`}
          className="grid size-[17px] shrink-0 place-items-center rounded-full border-[1.5px] border-text-muted text-transparent hover:border-success"
        >
          <HugeiconsIcon icon={Tick02Icon} className="size-2.5" />
        </button>
      )}

      <button type="button" onClick={onOpen} className="flex min-w-0 flex-col items-start text-left">
        <span className="w-full truncate text-[13.5px] font-medium">{row.title}</span>
        <span className="flex w-full items-center gap-1 truncate text-xs text-text-muted">
          <span className={cn('inline-block size-[7px] shrink-0 rounded-full', PRIORITY_DOT[row.priority])} title={`Prioridad ${PRIORITY_LABEL[row.priority] ?? row.priority}`} />
          <span className="truncate">{row.subtitle}</span>
        </span>
      </button>

      <div className="flex items-center gap-2">
        {row.assignees.length > 0 && (
          <AvatarGroup>
            {row.assignees.slice(0, MAX_ASSIGNEE_AVATARS).map((a) => (
              <Avatar key={a.user_id} size="sm">
                {a.assignee?.avatar_url && <AvatarImage src={a.assignee.avatar_url} alt="" />}
                <AvatarFallback>{initials(a.assignee?.full_name)}</AvatarFallback>
              </Avatar>
            ))}
            {row.assignees.length > MAX_ASSIGNEE_AVATARS && (
              <AvatarGroupCount>+{row.assignees.length - MAX_ASSIGNEE_AVATARS}</AvatarGroupCount>
            )}
          </AvatarGroup>
        )}

        <span className={cn('shrink-0 font-mono text-[11.5px] whitespace-nowrap group-hover/row:hidden', row.whenBad ? 'text-danger-text' : 'text-text-secondary')}>
          {row.when}
        </span>

        <span className="hidden shrink-0 gap-1 group-hover/row:flex group-focus-within/row:flex">
          {row.isReview ? (
            <>
              <Button type="button" variant="outline" size="xs" onClick={onApprove}>
                Aprobar
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={onOpen}>
                Abrir
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="xs" onClick={onToggleDone}>
                Hecha
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={onSnooze}>
                Mañana
              </Button>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

function lowercaseFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)
}
