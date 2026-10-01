import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useProjects, workspaceStatusesQueryOptions } from '@/features/projects/queries'
import { useNotifications } from '@/features/notifications/queries'
import { describeNotification } from '@/features/notifications/describe'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { formatRelativeTime } from '@/lib/format-date'
import { initials } from '@/lib/initials'

const MAX_SHOWN = 3

interface UnreadSectionProps {
  workspaceId: string
  userId: string | undefined
}

// "Sin leer" (mockup https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy): las
// 3 notificaciones sin leer más recientes, menciones primero. Reusa
// `useNotifications`/`describeNotification` tal cual — la misma query y el
// mismo texto que ya arma Bandeja (InboxPage.tsx), no una copia adaptada:
// así "3 horas" en Inicio y en Bandeja siempre dicen lo mismo.
export function UnreadSection({ workspaceId, userId }: UnreadSectionProps) {
  const setNode = useSetNodeSearchParam()
  const { data: unread } = useNotifications(userId, { unreadOnly: true })
  const { data: projects } = useProjects(workspaceId)
  const projectIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])
  const { data: statuses } = useQuery(workspaceStatusesQueryOptions(projectIds))
  const statusesById = useMemo(() => new Map((statuses ?? []).map((s) => [s.id, { name: s.name }])), [statuses])

  const shown = useMemo(() => {
    const sorted = [...(unread ?? [])].sort((a, b) => (a.type === 'mention' ? 0 : 1) - (b.type === 'mention' ? 0 : 1))
    return sorted.slice(0, MAX_SHOWN)
  }, [unread])

  const total = unread?.length ?? 0

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Sin leer</h2>
        {total > 0 && (
          <span className="text-xs text-text-muted">
            {shown.length} de {total}
          </span>
        )}
        <Link to="/bandeja" className="ml-auto text-xs text-accent-text-on-bg hover:underline">
          Bandeja →
        </Link>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-alt/40 px-4 py-6 text-center text-sm text-text-muted">
          Sin novedades por ahora.
        </p>
      ) : (
        <div className="flex flex-col">
          {shown.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => n.node && setNode(n.node.id)}
              disabled={!n.node}
              className="grid grid-cols-[26px_minmax(0,1fr)] items-start gap-2.5 py-2.5 text-left not-first:border-t not-first:border-border disabled:cursor-default"
            >
              <Avatar size="sm">
                {n.actor?.avatar_url && <AvatarImage src={n.actor.avatar_url} alt="" />}
                <AvatarFallback>{initials(n.actor?.full_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-[13px] text-text-secondary">
                  <span className="mr-1 inline-block size-[7px] translate-y-[-1px] rounded-full bg-accent" />
                  {describeNotification(n, { statusesById })}
                </p>
                {n.node && <p className="truncate text-[12px] text-text">{n.node.title}</p>}
                <span className="text-[11.5px] text-text-muted">{formatRelativeTime(n.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
