import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckListIcon } from '@hugeicons/core-free-icons'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { myTasksQueryOptions, type MyTaskRow } from '@/features/tasks/queries'
import { useProjects } from '@/features/projects/queries'
import { useProfile } from '@/features/profile/queries'
import { useLastProjectView } from '@/features/projects/last-project-view'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { isClosedStatus } from '@/features/projects/status-kind'
import { groupByDueBucket } from '@/features/my-tasks/date-buckets'
import { cn } from '@/lib/utils'

const navItemClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-surface-alt transition-colors'
const activeNavItemClass = 'text-accent font-medium'

const BUCKET_LABELS: { key: keyof ReturnType<typeof groupByDueBucket<MyTaskRow>>; label: string }[] = [
  { key: 'conAtraso', label: 'Atrasadas' },
  { key: 'hoy', label: 'Vencen hoy' },
  { key: 'siguiente', label: 'Esta semana' },
  { key: 'sinFecha', label: 'Sin fecha' },
]

// "Por fecha" y "Por proyecto" son cuentas informativas (mismo dato que
// ya muestra "Mi trabajo" en /mis-tareas, groupByDueBucket reusado tal
// cual) — las tres, y las filas de proyecto, linkean a /mis-tareas o a
// la última vista de ese proyecto; no son un filtro nuevo de la propia
// página, solo un atajo con el conteo a la vista antes de entrar.
export function MisTareasPanel({ onNavigate }: { onNavigate?: () => void }) {
  const matchRoute = useMatchRoute()
  const { data: session } = useSession()
  const { workspaceId } = useCurrentWorkspace()
  const { data: allTasks } = useQuery(myTasksQueryOptions(workspaceId ?? '', session?.user.id))
  const { data: projects } = useProjects(workspaceId)
  const { data: profile } = useProfile(session?.user.id ?? '')
  const defaultViewRoute = defaultViewToRoute(profile?.default_view)
  const projectNameById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  const pending = useMemo(
    () => (allTasks ?? []).filter((t) => !isClosedStatus(t.status?.status_kind)),
    [allTasks],
  )
  const buckets = useMemo(() => groupByDueBucket(pending), [pending])

  const byProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of pending) {
      if (!t.projectId) continue
      map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([projectId, count]) => ({ projectId, count, name: projectNameById.get(projectId) ?? 'Proyecto' }))
      .sort((a, b) => b.count - a.count)
  }, [pending, projectNameById])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Link
          to="/mis-tareas"
          search={{ tab: undefined }}
          onClick={onNavigate}
          className={cn(navItemClass, !!matchRoute({ to: '/mis-tareas', search: { tab: undefined } }) && activeNavItemClass)}
        >
          <HugeiconsIcon icon={CheckListIcon} className="size-4 shrink-0" />
          Asignado a mí
        </Link>
        <Link
          to="/mis-tareas"
          search={{ tab: 'personal' }}
          onClick={onNavigate}
          className={cn(navItemClass, !!matchRoute({ to: '/mis-tareas', search: { tab: 'personal' } }) && activeNavItemClass)}
        >
          <HugeiconsIcon icon={CheckListIcon} className="size-4 shrink-0" />
          Lista personal
        </Link>
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Por fecha</span>
          {BUCKET_LABELS.map(({ key, label }) => {
            const count = buckets[key].length
            if (count === 0) return null
            return (
              <Link
                key={key}
                to="/mis-tareas"
                search={{ tab: undefined }}
                onClick={onNavigate}
                className={cn(navItemClass, 'justify-between')}
              >
                <span>{label}</span>
                <span className="font-mono text-xs text-text-muted tabular-nums">{count}</span>
              </Link>
            )
          })}
        </div>
      )}

      {byProject.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Por proyecto</span>
          {byProject.map((row) => (
            <ProjectRow
              key={row.projectId}
              projectId={row.projectId}
              name={row.name}
              count={row.count}
              defaultViewRoute={defaultViewRoute}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Componente aparte: useLastProjectView es un hook, llamarlo dentro del
// .map de arriba rompería las reglas de hooks apenas cambiara la
// cantidad de proyectos entre renders — mismo motivo que FavoriteLink en
// FavoritesList.tsx.
function ProjectRow({
  projectId,
  name,
  count,
  defaultViewRoute,
  onNavigate,
}: {
  projectId: string
  name: string
  count: number
  defaultViewRoute: ReturnType<typeof defaultViewToRoute>
  onNavigate?: () => void
}) {
  const lastView = useLastProjectView(projectId, defaultViewRoute)
  return (
    <Link
      to={lastView as '/p/$projectId/summary'}
      params={{ projectId }}
      onClick={onNavigate}
      className={cn(navItemClass, 'justify-between')}
    >
      <span className="truncate">{name}</span>
      <span className="font-mono text-xs text-text-muted tabular-nums">{count}</span>
    </Link>
  )
}
