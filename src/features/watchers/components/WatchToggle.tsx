import { HugeiconsIcon } from '@hugeicons/react'
import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { useTaskWatchers } from '@/features/watchers/queries'
import { useToggleTaskWatcherMutation } from '@/features/watchers/mutations'

interface WatchToggleProps {
  taskId: string
  userId: string | undefined
}

// "Seguir esta tarea": para enterarse de sus cambios sin ser responsable
// — el cliente que solo quiere ver el estado de "Enviar cotización".
export function WatchToggle({ taskId, userId }: WatchToggleProps) {
  const { data: watchers } = useTaskWatchers(taskId)
  const toggleMutation = useToggleTaskWatcherMutation(taskId, userId)
  const watching = !!userId && !!watchers?.some((w) => w.user_id === userId)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!userId}
      onClick={() => toggleMutation.mutate(watching)}
    >
      <HugeiconsIcon icon={watching ? ViewOffSlashIcon : ViewIcon} />
      {watching ? 'Dejar de seguir' : 'Seguir'}
    </Button>
  )
}
