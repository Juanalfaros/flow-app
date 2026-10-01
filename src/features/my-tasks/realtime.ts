import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  myTasksQueryOptions,
  delegatedTasksQueryOptions,
  unassignedRequestedTasksQueryOptions,
  personalTasksQueryOptions,
} from '@/features/tasks/queries'
import type { Database } from '@/types/database'

type NodeRow = Database['public']['Tables']['nodes']['Row']

// "Mis tareas" (home) agrega tareas de TODO el workspace por dueño/
// solicitante/personal — a diferencia de useContainerRealtimeChannel
// (src/lib/realtime.ts, una lista por proyecto con un `container_id`
// fijo al que suscribirse), acá no hay un solo contenedor: el filtro real
// (soy el assignee, o el creador, o está sin asignar) vive del lado de
// cada query, no de una columna simple filtrable por Postgres Changes.
// Mismo criterio invalidate-only que notifications/realtime.ts (no un
// parche fino fila por fila): son 4 queries chicas por usuario, no una
// lista de cientos de filas — invalidar y dejar que TanStack Query
// refetche es más simple de razonar por el mismo costo real.
//
// Sin este canal, un cambio hecho en otra pestaña/dispositivo (o por
// otro miembro del workspace) sobre una tarea que aparece en "Mis
// tareas" nunca se reflejaba acá — con `staleTime: Infinity` (ver
// query-client.ts) nada la volvía a pedir sola hasta un reload completo.
function invalidateMyTasks(qc: QueryClient, workspaceId: string, userId: string | undefined) {
  void qc.invalidateQueries({ queryKey: myTasksQueryOptions(workspaceId, userId).queryKey })
  void qc.invalidateQueries({ queryKey: delegatedTasksQueryOptions(workspaceId, userId).queryKey })
  void qc.invalidateQueries({ queryKey: unassignedRequestedTasksQueryOptions(workspaceId, userId).queryKey })
  void qc.invalidateQueries({ queryKey: personalTasksQueryOptions(workspaceId, userId).queryKey })
}

export function useMyTasksRealtimeChannel(workspaceId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!workspaceId) return
    // Reasignado a un const propio: TS no deja que el narrowing de arriba
    // "sobreviva" dentro de las funciones anidadas de más abajo (podrían
    // ejecutarse en cualquier momento futuro) — este binding sí lo hace.
    const wsId = workspaceId
    let active = true
    let channel: RealtimeChannel | null = null
    let debounceId: number | undefined

    // Varios eventos seguidos (ej. reordenar/editar varias tareas a la
    // vez) colapsan en una sola invalidación en vez de una por evento.
    function scheduleInvalidate() {
      if (debounceId) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        if (active) invalidateMyTasks(queryClient, wsId, userId)
      }, 400)
    }

    function subscribe() {
      channel = supabase
        .channel(`my-tasks:${wsId}:${userId ?? 'anon'}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'nodes', filter: `workspace_id=eq.${wsId}` },
          (payload) => {
            if (!active) return
            const row = (payload.new ?? payload.old) as Partial<NodeRow> | undefined
            if (row?.type !== 'task') return
            scheduleInvalidate()
          },
        )
        .subscribe()
    }

    function resyncAndResubscribe() {
      if (channel) supabase.removeChannel(channel)
      channel = null
      if (!active) return
      // Red de seguridad: eventos perdidos mientras la pestaña estuvo
      // oculta o sin red (mismo motivo que src/lib/realtime.ts y
      // notifications/realtime.ts — Android congela el proceso de la PWA
      // en segundo plano y el WebSocket muere sin avisar).
      invalidateMyTasks(queryClient, wsId, userId)
      subscribe()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (channel) supabase.removeChannel(channel)
        channel = null
      } else {
        resyncAndResubscribe()
      }
    }

    subscribe()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', resyncAndResubscribe)

    return () => {
      active = false
      if (debounceId) window.clearTimeout(debounceId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', resyncAndResubscribe)
      if (channel) supabase.removeChannel(channel)
    }
  }, [workspaceId, userId, queryClient])
}
