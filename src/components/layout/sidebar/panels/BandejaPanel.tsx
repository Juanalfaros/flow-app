import { useMemo } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { InboxIcon, AtSignIcon, UserAdd01Icon, ViewIcon, Archive01Icon } from '@hugeicons/core-free-icons'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useNotifications } from '@/features/notifications/queries'
import { useProjects } from '@/features/projects/queries'
import type { InboxFilter } from '@/features/notifications/components/InboxPage'
import { cn } from '@/lib/utils'

const navItemClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-surface-alt transition-colors'
const activeNavItemClass = 'text-accent font-medium'

const FILTER_ROWS: { filter: InboxFilter; icon: Parameters<typeof HugeiconsIcon>[0]['icon']; label: string }[] = [
  { filter: 'unread', icon: InboxIcon, label: 'Sin leer' },
  { filter: 'all', icon: InboxIcon, label: 'Todas' },
  { filter: 'mention', icon: AtSignIcon, label: 'Menciones' },
  { filter: 'assigned', icon: UserAdd01Icon, label: 'Asignadas a mí' },
  { filter: 'watched_activity', icon: ViewIcon, label: 'Siguiendo' },
]

// "Sin leer"/"Todas"/"Menciones"/"Asignadas a mí"/"Siguiendo" reflejan las
// mismas 5 pestañas de InboxPage.tsx — una sola query (`useNotifications`,
// sin `unreadOnly`) compartida con la página misma (mismo queryKey, mismo
// cache) alcanza para los conteos Y para filtrar, sin round-trips extra.
// "Por proyecto" agrupa por el container_id inmediato de cada
// notificación (no el space raíz — evita tener que cargar el árbol
// completo acá solo para esto). "Archivadas" queda como "Pronto": no
// existe ese estado en `notifications` todavía (solo `read_at`).
export function BandejaPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = useSession()
  const { workspaceId } = useCurrentWorkspace()
  const matchRoute = useMatchRoute()
  const { data: notifications } = useNotifications(session?.user.id)
  const { data: projects } = useProjects(workspaceId)
  const projectNameById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  const counts = useMemo(() => {
    const rows = notifications ?? []
    return {
      unread: rows.filter((n) => !n.read_at).length,
      all: rows.length,
      mention: rows.filter((n) => n.type === 'mention').length,
      assigned: rows.filter((n) => n.type === 'assigned').length,
      watched_activity: rows.filter((n) => n.type === 'watched_activity').length,
    }
  }, [notifications])

  const byProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of notifications ?? []) {
      if (n.read_at) continue
      const projectId = n.node?.memberships[0]?.container_id
      if (!projectId) continue
      map.set(projectId, (map.get(projectId) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([projectId, count]) => ({ projectId, count, name: projectNameById.get(projectId) ?? 'Proyecto' }))
      .sort((a, b) => b.count - a.count)
  }, [notifications, projectNameById])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        {FILTER_ROWS.map((row) => (
          <Link
            key={row.filter}
            to="/bandeja"
            search={{ filter: row.filter === 'unread' ? undefined : row.filter }}
            onClick={onNavigate}
            className={cn(
              navItemClass,
              'justify-between',
              !!matchRoute({ to: '/bandeja', search: { filter: row.filter === 'unread' ? undefined : row.filter } }) &&
                activeNavItemClass,
            )}
          >
            <span className="flex items-center gap-2">
              <HugeiconsIcon icon={row.icon} className="size-4 shrink-0" />
              {row.label}
            </span>
            {!!counts[row.filter] && (
              <span className="font-mono text-xs text-text-muted tabular-nums">{counts[row.filter]}</span>
            )}
          </Link>
        ))}
        <div
          title="Próximamente"
          className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-muted/70"
        >
          <HugeiconsIcon icon={Archive01Icon} className="size-4 shrink-0 opacity-70" />
          <span className="flex-1 truncate">Archivadas</span>
          <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            Pronto
          </span>
        </div>
      </div>

      {byProject.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Por proyecto</span>
          {byProject.map((row) => (
            <Link
              key={row.projectId}
              to="/bandeja"
              onClick={onNavigate}
              className={cn(navItemClass, 'justify-between')}
            >
              <span className="truncate">{row.name}</span>
              <span className="font-mono text-xs text-text-muted tabular-nums">{row.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
