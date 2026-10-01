import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useTaskPresence } from '@/features/tasks/useTaskPresence'
import { initials } from '@/lib/initials'

export function TaskPresenceAvatars({ taskId }: { taskId: string }) {
  const viewers = useTaskPresence(taskId)

  if (viewers.length === 0) return null

  return (
    <div className="flex -space-x-2" title={viewers.map((v) => v.full_name).join(', ')}>
      {viewers.map((viewer, i) => (
        <Avatar key={`${viewer.full_name}-${i}`} size="sm" className="ring-2 ring-bg">
          {viewer.avatar_url && <AvatarImage src={viewer.avatar_url} alt="" />}
          <AvatarFallback>{initials(viewer.full_name)}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  )
}
