import { useEffect, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Quién está conectado ahora mismo, para todo el workspace.
 *
 * Dos mecanismos con costos muy distintos:
 *
 *   - EN VIVO: un canal de Realtime con `presence`. Cero escrituras en base —
 *     el estado vive en el canal y se sincroniza entre pares. Es el mismo
 *     patrón que `useTaskPresence` (features/tasks), generalizado a nivel
 *     workspace.
 *   - HISTÓRICO: la RPC `touch_presence`, llamada con throttle de 5 minutos,
 *     que acumula una fila por persona por día (ver 0027_presence.sql).
 *
 * El estado vive a nivel módulo y no en un contexto de React: el canal debe ser
 * UNO por pestaña, no uno por componente que quiera saber quién está en línea.
 * Mismo enfoque que `offline-queue.ts` para el estado de conexión.
 */

const HEARTBEAT_MINUTES = 5
const HEARTBEAT_MS = HEARTBEAT_MINUTES * 60 * 1000

let onlineIds: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()
let channel: RealtimeChannel | null = null
let subscribers = 0
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function emit(next: ReadonlySet<string>) {
  onlineIds = next
  listeners.forEach((l) => l())
}

/**
 * Suscribe la pestaña al canal de presencia del workspace.
 *
 * Llamar desde UN solo lugar (el layout de `_app`): el contador de suscriptores
 * evita canales duplicados si en el futuro se monta desde más de un sitio, pero
 * la intención es que haya exactamente uno.
 */
export function useWorkspacePresence(workspaceId: string, userId: string | undefined) {
  useEffect(() => {
    if (!workspaceId || !userId) return

    subscribers += 1
    if (!channel) {
      channel = supabase.channel(`workspace-presence:${workspaceId}`, {
        // La clave de presencia es el user id: si alguien abre dos pestañas,
        // ambas colapsan en la misma entrada y aparece conectado una vez.
        config: { presence: { key: userId } },
      })

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel?.presenceState() ?? {}
          emit(new Set(Object.keys(state)))
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void channel?.track({ at: Date.now() })
        })
    }

    // El histórico se marca al entrar y después cada 5 minutos. `void` porque
    // un fallo acá no debe romper nada visible: la presencia en vivo sigue
    // funcionando aunque el registro diario falle.
    const beat = () => {
      void supabase.rpc('touch_presence', {
        p_workspace_id: workspaceId,
        p_interval_minutes: HEARTBEAT_MINUTES,
      })
    }
    beat()
    heartbeatTimer ??= setInterval(beat, HEARTBEAT_MS)

    return () => {
      subscribers -= 1
      if (subscribers > 0) return
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      if (channel) {
        supabase.removeChannel(channel)
        channel = null
      }
      emit(new Set())
    }
  }, [workspaceId, userId])
}

/** Ids de quienes están conectados ahora. Re-renderiza al cambiar el conjunto. */
export function useOnlineUserIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => onlineIds,
  )
}

/** Texto de "última vez visto", para quien no está conectado. */
export function describeLastSeen(lastSeenAt: string | null): string | null {
  if (!lastSeenAt) return null
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Hace instantes'
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ayer'
  if (days < 30) return `Hace ${days} días`
  return null
}
