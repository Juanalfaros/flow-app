import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Comment01Icon } from '@hugeicons/core-free-icons'
import { useNotifications } from '@/features/notifications/queries'
import { describeNotification } from '@/features/notifications/describe'
import { SectionCard } from '@/features/home/components/SectionCard'

export function AssignedCommentsWidget({ userId }: { userId: string | undefined }) {
  const { data: notifications } = useNotifications(userId, { unreadOnly: true })
  const items = useMemo(
    () => notifications?.filter((n) => n.type === 'comment' || n.type === 'mention') ?? [],
    [notifications],
  )
  const statusesById = useMemo(() => new Map(), [])

  return (
    <SectionCard icon={Comment01Icon} title="Comentarios asignados">
      {notifications === undefined ? null : items.length === 0 ? (
        // Plan de corrección de layout, ronda 2 (2026-09-24): sin marco
        // punteado, mismo criterio que el resto de los vacíos de la app.
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <HugeiconsIcon icon={Comment01Icon} className="size-5 text-text-muted/60" />
          <p className="text-xs text-text-muted">No tienes ningún comentario asignado.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => {
            const projectId = n.node?.memberships[0]?.container_id
            return (
              <li key={n.id} className="text-xs">
                {projectId && n.node ? (
                  <Link
                    to="/p/$projectId/t/$taskId"
                    params={{ projectId, taskId: n.node.id }}
                    className="truncate font-medium text-text hover:underline"
                  >
                    {n.node.title}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-text">{n.node?.title ?? 'una tarea'}</span>
                )}
                <p className="text-text-muted">{describeNotification(n, { statusesById })}</p>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
