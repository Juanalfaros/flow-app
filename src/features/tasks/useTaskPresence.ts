import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'

interface PresenceViewer {
  full_name: string
  avatar_url: string | null
}

export function useTaskPresence(taskId: string) {
  const { data: session } = useSession()
  // `user_metadata.full_name` (auth.users) no trae avatar_url — se
  // necesita `profiles`, la misma fuente que ya usa el resto de la app
  // para la foto. Antes TaskPresenceAvatars nunca podía mostrar una foto
  // real porque el dato ni siquiera viajaba por el canal de presencia.
  const { data: profile } = useProfile(session?.user.id ?? '')
  const [viewers, setViewers] = useState<PresenceViewer[]>([])

  useEffect(() => {
    if (!taskId || !session?.user) return
    const userId = session.user.id
    const label = profile?.full_name ?? session.user.email ?? 'Alguien'
    const avatarUrl = profile?.avatar_url ?? null

    const channel = supabase.channel(`task:${taskId}`, {
      config: { presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceViewer>()
        const others = Object.entries(state)
          .filter(([presenceUserId]) => presenceUserId !== userId)
          .map(([, presences]) => presences[0])
          .filter((p) => p !== undefined)
        setViewers(others)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ full_name: label, avatar_url: avatarUrl })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [taskId, session?.user, profile?.full_name, profile?.avatar_url])

  return viewers
}
