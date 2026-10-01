import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Calendar01Icon,
  ChartGanttIcon,
  Diamond01Icon,
  KanbanIcon,
  ListViewIcon,
} from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ProjectPageHeader } from '@/features/projects/components/ProjectPageHeader'
import { BoardSkeleton } from '@/features/projects/components/ProjectViewSkeleton'
import { ActivityRowsSkeleton } from '@/components/layout/PageSkeletons'
import { useProject, useStatuses } from '@/features/projects/queries'
import { useUpdateProjectDescriptionMutation } from '@/features/projects/mutations'
import { useTasks } from '@/features/tasks/queries'
import { CreateTaskButton } from '@/features/tasks/components/CreateTaskButton'
import { useCurrentWorkspace, useWorkspaceMembers } from '@/features/workspace/queries'
import { useProjectActivity } from '@/features/activity/queries'
import { ActivityFeed } from '@/features/activity/components/ActivityFeed'
import { STATUS_KIND_BADGE, isClosedStatus, isDoneStatus } from '@/features/projects/status-kind'
import { TaskDescriptionEditor } from '@/features/tasks/components/TaskDescriptionEditor'
import { AttachmentList } from '@/features/attachments/components/AttachmentList'
import { useSession } from '@/features/auth/queries'
import { initials } from '@/lib/initials'
import { formatDueDate, formatShortDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/p/$projectId/summary')({
  component: ProjectSummaryPage,
})

const JUMP_LINKS = [
  { to: '/p/$projectId/board' as const, icon: KanbanIcon, label: 'Board' },
  { to: '/p/$projectId/list' as const, icon: ListViewIcon, label: 'Lista' },
  { to: '/p/$projectId/calendar' as const, icon: Calendar01Icon, label: 'Calendario' },
  { to: '/p/$projectId/gantt' as const, icon: ChartGanttIcon, label: 'Gantt' },
]

function ProjectSummaryPage() {
  const { projectId } = Route.useParams()
  const { data: session } = useSession()
  const { data: project } = useProject(projectId)
  const { data: statuses, isPending: statusesPending } = useStatuses(projectId)
  const { data: tasks } = useTasks(projectId)
  const { workspaceId } = useCurrentWorkspace()
  const { data: members } = useWorkspaceMembers(workspaceId ?? '')
  const { data: activity, isPending: activityPending } = useProjectActivity(projectId)
  const updateDescriptionMutation = useUpdateProjectDescriptionMutation(projectId)

  const statusesById = useMemo(() => new Map((statuses ?? []).map((s) => [s.id, s])), [statuses])
  // Vista reducida para describeActivity (solo necesita `name`) — separada
  // de statusesById (que además guarda status_kind para las stats de
  // arriba) para no reconstruirla en cada entrada del feed de actividad.
  const statusNamesById = useMemo(
    () => new Map([...statusesById].map(([id, s]) => [id, { name: s.name }])),
    [statusesById],
  )
  const membersById = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, { full_name: m.profile?.full_name ?? null }])),
    [members],
  )

  const stats = useMemo(() => {
    const list = tasks ?? []
    // Las descartadas no suman al progreso — ni como "hechas" ni como
    // "abiertas" (decisión de producto: "Cerrar con subtareas abiertas") —
    // así que total/done/overdue se calculan sobre `activeList`, no
    // `list`. `byStatus`/milestones más abajo sí siguen usando `list`
    // completa: una descartada debe seguir contando en el desglose por
    // estado (trazabilidad), solo no en el progreso.
    const activeList = list.filter((t) => statusesById.get(t.status_id ?? '')?.status_kind !== 'dropped')
    const total = activeList.length
    const done = activeList.filter((t) => isDoneStatus(statusesById.get(t.status_id ?? '')?.status_kind)).length
    // formatDueDate ya resuelve "vencida" con parseISO (zona local) +
    // isBefore/startOfDay — `new Date(t.due_date) < today` a mano acá
    // reintroducía el bug que ese helper existe para evitar: una fecha sin
    // hora se interpreta como medianoche UTC, así que en husos horarios
    // negativos (Chile, UTC-3/4) una tarea que vence hoy contaba como
    // vencida durante gran parte de la mañana.
    const overdue = activeList.filter((t) => {
      if (!t.due_date || isClosedStatus(statusesById.get(t.status_id ?? '')?.status_kind)) return false
      return formatDueDate(t.due_date).state === 'overdue'
    }).length

    // Por estado real, no por `status_kind` — ese es el enum de severidad
    // interno (neutral/warning/success/danger), no un nombre que alguien
    // del equipo reconozca. "Neutral 50 · Advertencia 6" no dice nada;
    // "Por hacer 12 · En progreso 8" sí.
    const byStatus = new Map<string, number>()
    for (const t of list) {
      if (!t.status_id) continue
      byStatus.set(t.status_id, (byStatus.get(t.status_id) ?? 0) + 1)
    }

    const nextMilestone = list
      .filter((t) => t.is_milestone && t.due_date)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]

    const upcomingMilestones = list
      .filter((t) => t.is_milestone && t.due_date)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
      .slice(0, 3)

    const assigneeCounts = new Map<string, { name: string; avatarUrl: string | null; count: number }>()
    for (const t of list) {
      if (!t.assignee) continue
      const existing = assigneeCounts.get(t.assignee.id)
      if (existing) existing.count += 1
      else
        assigneeCounts.set(t.assignee.id, {
          name: t.assignee.full_name ?? 'Sin nombre',
          avatarUrl: t.assignee.avatar_url,
          count: 1,
        })
    }
    const topAssignees = [...assigneeCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5)

    return { total, done, overdue, byStatus, nextMilestone, upcomingMilestones, topAssignees }
  }, [tasks, statusesById])

  const progressPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
  // Mismo criterio que CreateTaskButton.tsx (su propio comentario lo cita
  // igual) y el input inline de list.tsx: status por default del proyecto.
  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]

  if (statusesPending) return <BoardSkeleton />

  return (
    <div className="p-6 pb-16">
      <ProjectPageHeader
        projectId={projectId}
        workspaceId={workspaceId ?? ''}
        projectName={project?.name}
        showDensityToggle={false}
      />

      <div className="mb-6 max-w-3xl">
        <TaskDescriptionEditor
          content={project?.description ?? ''}
          onSave={(html) => updateDescriptionMutation.mutate(html)}
        />
      </div>

      {stats.total === 0 ? (
        // F-07: con 0 tareas, la grilla de 4 stats de abajo solo mostraba
        // ceros y "Sin hitos" — información nula, sin ninguna acción a
        // mano. Mismo flujo de creación que Board (CreateTaskButton, con
        // el status por default del proyecto).
        <div className="mb-6 flex flex-col items-center gap-3 rounded-card border border-dashed border-border p-10 text-center">
          <HugeiconsIcon icon={KanbanIcon} className="size-8 text-text-muted/50" />
          <div>
            <h2 className="text-sm font-medium">Todavía no hay tareas acá</h2>
            <p className="mt-1 max-w-sm text-xs text-text-muted">
              Progreso, vencidas y actividad van a aparecer en cuanto haya algo que trackear.
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <CreateTaskButton projectId={projectId} statusId={defaultStatus?.id} />
            <Button variant="outline" size="sm" asChild>
              <Link to="/p/$projectId/board" params={{ projectId }}>
                <HugeiconsIcon icon={KanbanIcon} />
                Ir al Board
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 @min-[720px]:grid-cols-4">
          <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
            <div className="font-mono text-[11px] tracking-wide text-text-muted uppercase">Progreso</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{progressPct}%</div>
            <div
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progreso del proyecto"
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt"
            >
              <div className="h-full rounded-full bg-success" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
            <div className="font-mono text-[11px] tracking-wide text-text-muted uppercase">Tareas</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</div>
            <div className="mt-2 text-xs text-text-muted">
              {stats.done} hechas · {stats.total - stats.done} abiertas
            </div>
          </div>
          {/* F-07: antes era el único stat sin ninguna acción — ahora lleva
              a la Lista ordenada por fecha límite, que sube las vencidas
              arriba de todo (no hay un filtro "solo vencidas" dedicado
              todavía, ver FilterBar.tsx). */}
          <Link
            to="/p/$projectId/list"
            params={{ projectId }}
            search={{ sort: 'dueDate' }}
            className="rounded-card border border-border/60 bg-surface p-4 shadow-card transition-colors hover:bg-surface-alt"
          >
            <div className="font-mono text-[11px] tracking-wide text-text-muted uppercase">Vencidas</div>
            <div className={cn('mt-1 text-2xl font-semibold tabular-nums', stats.overdue > 0 && 'text-danger-text')}>
              {stats.overdue}
            </div>
            <div className="mt-2 text-xs text-text-muted">
              {stats.overdue > 0 ? 'requieren atención →' : 'requieren atención'}
            </div>
          </Link>
          <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
            <div className="font-mono text-[11px] tracking-wide text-text-muted uppercase">Próximo hito</div>
            {stats.nextMilestone ? (
              <>
                <div className="mt-1 truncate text-lg font-semibold">{formatShortDate(stats.nextMilestone.due_date!)}</div>
                <div className="mt-2 truncate text-xs text-text-muted">{stats.nextMilestone.title}</div>
              </>
            ) : (
              <div className="mt-1 text-sm text-text-muted">Sin hitos</div>
            )}
          </div>
        </div>
      )}

      {statuses && statuses.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {/* `statuses` ya viene ordenado por `position` (mismo orden que
              las columnas del Board) — se itera directo en vez de
              `stats.byStatus.entries()` para que el orden de los chips
              coincida, y se salta el estado si nadie lo usa. */}
          {statuses
            .filter((s) => (stats.byStatus.get(s.id) ?? 0) > 0)
            .map((s) => (
              <span
                key={s.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                  STATUS_KIND_BADGE[s.status_kind],
                )}
              >
                {s.name}
                <span className="font-mono opacity-75">{stats.byStatus.get(s.id)}</span>
              </span>
            ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 @min-[900px]:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-text">Actividad reciente</h2>
            {/* `activityPending` primero (mismo motivo que `statusesPending`
                en list.tsx): sin ese guard, mientras la query carga
                `activity` es `undefined` y el estado vacío se mostraba un
                instante ANTES de saber si había actividad — un "todavía no
                hay actividad" falso en cada carga de la página (B-09). */}
            {activityPending ? (
              <ActivityRowsSkeleton />
            ) : (
              <ActivityFeed
                entries={activity ?? []}
                context={{ statusesById: statusNamesById, membersById }}
                emptyLabel="Todavía no hay actividad en esta lista."
              />
            )}
          </div>

          {stats.upcomingMilestones.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-text">Próximos hitos</h2>
              <ul className="flex flex-col gap-1">
                {stats.upcomingMilestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 border-t border-border py-1.5 text-sm first:border-t-0">
                    <HugeiconsIcon icon={Diamond01Icon} className="size-2.5 shrink-0 text-accent-2" />
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    <span className="shrink-0 font-mono text-xs text-text-muted">{formatDueDate(m.due_date!).label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {stats.topAssignees.length > 0 && (
            <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
              <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">
                Trabajando acá
              </h3>
              <ul className="flex flex-col gap-2">
                {stats.topAssignees.map((a) => (
                  <li key={a.name} className="flex items-center gap-2 text-sm">
                    <Avatar size="sm">
                      {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt="" />}
                      <AvatarFallback>{initials(a.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <span className="font-mono text-xs text-text-muted">{a.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
            <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">
              Archivos
            </h3>
            {/* `task_attachments.node_id` referencia cualquier nodo, no
                solo tareas (sin chequeo de type en la tabla ni en la
                RLS) — el mismo AttachmentList que ya usa el detalle de
                tarea funciona aquí tal cual, apuntado al nodo del
                proyecto en vez de al de una tarea. */}
            <AttachmentList nodeId={projectId} currentUserId={session?.user.id} />
          </div>

          <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
            <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">Ir a</h3>
            <ul className="flex flex-col gap-0.5">
              {JUMP_LINKS.map((jump) => (
                <li key={jump.to}>
                  <Link
                    to={jump.to}
                    params={{ projectId }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-alt"
                  >
                    <HugeiconsIcon icon={jump.icon} className="size-4 text-text-muted" />
                    {jump.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
