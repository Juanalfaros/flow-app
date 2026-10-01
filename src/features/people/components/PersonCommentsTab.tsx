import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Comment01Icon } from '@hugeicons/core-free-icons'
import { Skeleton } from '@/components/ui/skeleton'
import { personCommentsQueryOptions } from '@/features/comments/queries'

export function PersonCommentsTab({ userId }: { userId: string }) {
  const { data: comments, isPending } = useQuery(personCommentsQueryOptions(userId))

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    )
  }

  if (!comments || comments.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border py-8 text-center">
        <HugeiconsIcon icon={Comment01Icon} className="mx-auto size-5 text-text-muted/60" />
        <p className="mt-2 text-xs text-text-muted">Todavía no ha comentado nada.</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {comments.map((comment) => {
        const projectId = comment.node?.memberships[0]?.container_id
        return (
          <li key={comment.id} className="flex flex-col gap-0.5">
            <p className="text-sm break-words">{comment.body}</p>
            {comment.node && projectId && (
              <Link
                to="/p/$projectId/t/$taskId"
                params={{ projectId, taskId: comment.node.id }}
                className="truncate text-xs text-accent-text-on-bg hover:underline"
              >
                {comment.node.title}
              </Link>
            )}
            <time className="text-[10px] text-text-muted">
              {new Date(comment.created_at).toLocaleString('es-CL')}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
