import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { personActivityQueryOptions } from '@/features/activity/queries'
import { describeActivity } from '@/features/activity/describe'
import { useActivityContext } from '@/features/activity/use-activity-context'

export function PersonActivityTab({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const { data: entries, isPending } = useQuery(personActivityQueryOptions(workspaceId, userId))
  const activityContext = useActivityContext(workspaceId)

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  }

  if (!entries || entries.length === 0) {
    return <p className="text-sm text-text-muted">Sin actividad registrada.</p>
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {entries.map((entry) => {
        const projectId = entry.node?.memberships[0]?.container_id
        return (
          <li key={entry.id} className="text-sm">
            {/* `describeActivity` es el mismo traductor que usan el feed de
                tarea y la home: convierte el payload crudo del trigger en una
                frase legible, resolviendo ids de estado y de persona. */}
            <p className="text-text-secondary">{describeActivity(entry, activityContext)}</p>
            {entry.node && projectId && (
              <Link
                to="/p/$projectId/t/$taskId"
                params={{ projectId, taskId: entry.node.id }}
                className="truncate text-xs text-accent-text-on-bg hover:underline"
              >
                {entry.node.title}
              </Link>
            )}
            <time className="block text-[10px] text-text-muted">
              {new Date(entry.created_at).toLocaleString('es-CL')}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
