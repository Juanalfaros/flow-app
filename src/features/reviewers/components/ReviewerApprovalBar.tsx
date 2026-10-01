import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useTaskReviewers } from '@/features/reviewers/queries'
import { useDecideTaskReviewMutation } from '@/features/reviewers/mutations'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

interface ReviewerApprovalBarProps {
  taskId: string
  userId: string | undefined
}

const STATUS_LABEL: Record<'pending' | 'approved' | 'rejected', string> = {
  pending: 'Pendiente',
  approved: 'Aprobó',
  rejected: 'Rechazó',
}

const STATUS_CLASS: Record<'pending' | 'approved' | 'rejected', string> = {
  pending: 'bg-surface-alt text-text-muted',
  approved: 'bg-success-bg text-success-text',
  rejected: 'bg-danger-bg text-danger-text',
}

// Chips con el estado de cada revisor + Aprobar/Rechazar para la propia
// fila del usuario actual (si es uno de los revisores). Todos deben
// aprobar para que el gate (enforce_reviewer_gate, 0046) deje completar
// la tarea — no alcanza con que apruebe uno solo.
export function ReviewerApprovalBar({ taskId, userId }: ReviewerApprovalBarProps) {
  const { data: reviewers } = useTaskReviewers(taskId)
  const decideMutation = useDecideTaskReviewMutation(taskId)
  const myRow = reviewers?.find((r) => r.user_id === userId)

  if (!reviewers || reviewers.length === 0) return null

  return (
    <div className="rounded-card border border-border/60 bg-surface p-3">
      <h3 className="mb-2 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">
        Revisión requerida
      </h3>
      <div className="flex flex-col gap-1.5">
        {reviewers.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <Avatar size="sm">
              {r.reviewer.avatar_url && <AvatarImage src={r.reviewer.avatar_url} alt="" />}
              <AvatarFallback>{initials(r.reviewer.full_name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate">{r.reviewer.full_name ?? r.user_id}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[r.status])}>
              {STATUS_LABEL[r.status]}
            </span>
          </div>
        ))}
      </div>
      {myRow && myRow.status === 'pending' && (
        <div className="mt-2.5 flex gap-1.5">
          <Button size="sm" onClick={() => decideMutation.mutate(true)}>
            <HugeiconsIcon icon={Tick02Icon} />
            Aprobar
          </Button>
          <Button size="sm" variant="outline" onClick={() => decideMutation.mutate(false)}>
            <HugeiconsIcon icon={Cancel01Icon} />
            Rechazar
          </Button>
        </div>
      )}
    </div>
  )
}
