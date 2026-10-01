import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkBadge01Icon } from '@hugeicons/core-free-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useToggleTaskReviewerMutation } from '@/features/reviewers/mutations'
import type { TaskReviewerRow } from '@/features/reviewers/queries'

interface ReviewerPickerProps {
  workspaceId: string
  taskId: string
  reviewers: TaskReviewerRow[]
}

// Clon de LabelPicker/ResponsablePicker — asignar/quitar revisores. La
// presencia de una fila acá ya significa "esta tarea necesita revisión";
// decidir (aprobar/rechazar) vive en ReviewerApprovalBar, no acá.
export function ReviewerPicker({ workspaceId, taskId, reviewers }: ReviewerPickerProps) {
  const { data: members } = useWorkspaceMembers(workspaceId)
  const toggleMutation = useToggleTaskReviewerMutation(taskId)
  const assignedIds = new Set(reviewers.map((r) => r.user_id))

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <HugeiconsIcon icon={CheckmarkBadge01Icon} />
          Revisores
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        <div className="flex flex-col gap-1">
          {members?.length === 0 && (
            <p className="p-1 text-xs text-text-muted">Sin otros miembros en el workspace.</p>
          )}
          {members?.map((m) => {
            const existing = reviewers.find((r) => r.user_id === m.user_id)
            const assigned = assignedIds.has(m.user_id)
            return (
              <label key={m.user_id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface">
                <Checkbox
                  checked={assigned}
                  onCheckedChange={() =>
                    toggleMutation.mutate({
                      assigned,
                      reviewer: existing ?? {
                        id: crypto.randomUUID(),
                        user_id: m.user_id,
                        status: 'pending',
                        reviewer: m.profile ?? { id: m.user_id, full_name: null, avatar_url: null },
                      },
                    })
                  }
                />
                {m.profile?.full_name ?? m.user_id}
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
