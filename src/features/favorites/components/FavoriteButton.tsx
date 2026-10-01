import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth/queries'
import { useIsFavorited } from '@/features/favorites/queries'
import { useToggleFavoriteMutation } from '@/features/favorites/mutations'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
  nodeId: string
  nodeName: string
  /** 'project' (Favoritos) o 'task' (Prioridades) — determina en qué
   * sección aparece una vez fijado, ver favorites/queries.ts. */
  nodeType: 'project' | 'task'
}

// No hay asset "solid" separado para StarIcon en este set de íconos —
// el estado favorito se marca rellenando el mismo trazo (fill-current)
// con el acento ámbar (accent-2), ya usado para prioridad "alta".
export function FavoriteButton({ nodeId, nodeName, nodeType }: FavoriteButtonProps) {
  const { data: session } = useSession()
  const userId = session?.user.id
  const isFavorited = useIsFavorited(userId, nodeId)
  const toggleMutation = useToggleFavoriteMutation(userId)

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={!userId}
      aria-pressed={isFavorited}
      aria-label={isFavorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      onClick={() =>
        toggleMutation.mutate(
          { nodeId, nodeName, nodeType, isFavorited },
          { onError: () => toast.error('No se pudo actualizar favoritos.') },
        )
      }
    >
      <HugeiconsIcon
        icon={StarIcon}
        className={cn('size-4', isFavorited ? 'fill-accent-2 text-accent-2' : 'text-text-muted')}
      />
    </Button>
  )
}
