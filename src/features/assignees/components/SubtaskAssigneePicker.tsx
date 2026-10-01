import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useSetSubtaskAssigneeMutation } from '@/features/tasks/mutations'
import { cn } from '@/lib/utils'

interface SubtaskAssigneePickerProps {
  workspaceId: string
  parentTaskId: string
  taskId: string
  assigneeId: string | null
}

// Selector de UN solo responsable, no un pool (a diferencia de
// ResponsablePicker, que sí permite varios) — decisión explícita del
// usuario: una subtarea es la unidad atómica en la que ya se dividió el
// trabajo, no necesita "varios asignados" propio. Elegir a alguien
// reemplaza a quien estuviera antes; elegir a quien ya está asignado lo
// desasigna. Cubre a cualquier persona del workspace — el quick-assign de
// SubtaskList.tsx (avatares de la tarea padre) alcanza para el caso común,
// esto es para cuando hace falta alguien fuera de ese pool.
export function SubtaskAssigneePicker({ workspaceId, parentTaskId, taskId, assigneeId }: SubtaskAssigneePickerProps) {
  const { data: members } = useWorkspaceMembers(workspaceId)
  const assignMutation = useSetSubtaskAssigneeMutation(parentTaskId)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Asignar responsable"
          title="Asignar responsable"
          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-text-muted hover:border-accent hover:text-accent"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="flex flex-col gap-0.5">
          {members?.length === 0 && (
            <p className="p-1 text-xs text-text-muted">Sin otros miembros en el workspace.</p>
          )}
          {members?.map((m) => {
            const selected = assigneeId === m.user_id
            return (
              <button
                key={m.user_id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  assignMutation.mutate({
                    taskId,
                    assigneeId: selected ? null : m.user_id,
                    assigneeProfile: selected ? null : m.profile,
                  })
                }
                className={cn(
                  'rounded px-1.5 py-1 text-left text-sm hover:bg-surface-alt',
                  selected && 'bg-accent-soft text-accent',
                )}
              >
                {m.profile?.full_name ?? m.user_id}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
