import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSession } from '@/features/auth/queries'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'
import type { TaskFilters } from '@/features/projects/components/FilterBar'

interface MyTasksToggleProps {
  workspaceId: string
  filters: TaskFilters
  onChange: (filters: TaskFilters) => void
}

// Reusa el filtro de asignado existente (FilterBar) con el id del usuario
// logueado — no es un concepto de filtro nuevo, solo un atajo de un clic.
// Solo el avatar (sin texto): el nombre queda en el tooltip.
export function MyTasksToggle({ workspaceId, filters, onChange }: MyTasksToggleProps) {
  const { data: session } = useSession()
  const userId = session?.user.id
  const { data: members } = useWorkspaceMembers(workspaceId)
  const me = members?.find((m) => m.user_id === userId)
  const active = !!userId && (filters.assigneeIds?.length === 1 && filters.assigneeIds[0] === userId)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={!userId}
          aria-pressed={active}
          aria-label="Mis tareas"
          onClick={() => onChange({ ...filters, assigneeIds: active || !userId ? undefined : [userId] })}
          className={cn(
            'rounded-full transition-shadow disabled:pointer-events-none disabled:opacity-50',
            active && 'ring-2 ring-accent ring-offset-1 ring-offset-surface',
          )}
        >
          <Avatar size="sm">
            {me?.profile?.avatar_url && <AvatarImage src={me.profile.avatar_url} alt="" />}
            <AvatarFallback>{initials(me?.profile?.full_name ?? null)}</AvatarFallback>
          </Avatar>
        </button>
      </TooltipTrigger>
      <TooltipContent>Mis tareas</TooltipContent>
    </Tooltip>
  )
}
