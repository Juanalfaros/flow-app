import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

/**
 * URL del feed iCal propio.
 *
 * El token se crea la primera vez que alguien abre su pestaña Calendario, no
 * en el alta: la mayoría no va a suscribir nada, y no tiene sentido repartir
 * credenciales que nadie pidió.
 */
export const calendarFeedQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['calendar-feed', workspaceId] as const,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('get_or_create_calendar_feed', {
        p_workspace_id: workspaceId,
      })
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
    // Sin refetch: el token no cambia salvo que se rote a mano, y cada
    // consulta es una escritura potencial en la base.
    staleTime: Infinity,
  })

export function useCalendarFeed(workspaceId: string) {
  return useQuery(calendarFeedQueryOptions(workspaceId))
}

/**
 * Cuándo Google leyó el feed por última vez (rediseño de Ajustes PR 5).
 *
 * Consulta aparte de `calendarFeedQueryOptions`: esa lee vía RPC (crea el
 * token si no existe) y devuelve solo el string, esta lee la fila directo
 * — `calendar_feeds_select_own` (0033) ya permite leer la propia sin RPC.
 * `last_accessed_at` lo actualiza `calendar_feed_events()` (el endpoint
 * público que consume Google, worker/calendar.ts) cada vez que alguien —
 * en la práctica, Google — pide el `.ics`.
 */
export const calendarFeedAccessQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['calendar-feed-access', userId] as const,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('calendar_feeds')
        .select('last_accessed_at')
        .eq('user_id', userId as string)
        .maybeSingle()
      if (error) throw error
      return data?.last_accessed_at ?? null
    },
    enabled: !!userId,
  })

export function useCalendarFeedAccess(userId: string | undefined) {
  return useQuery(calendarFeedAccessQueryOptions(userId))
}

/** La URL completa, lista para pegar en Google Calendar. */
export function calendarFeedUrl(token: string): string {
  // `window.location.origin` y no una constante: en el sitio desplegado apunta
  // al Worker, y con `wrangler dev` al servidor local sin tener que cambiar
  // nada. Google necesita que termine en .ics para reconocerla.
  return `${window.location.origin}/api/calendar/${token}.ics`
}

export function useRegenerateCalendarFeedMutation(workspaceId: string, userId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('regenerate_calendar_feed', {
        p_workspace_id: workspaceId,
      })
      if (error) throw error
      return data
    },
    onSuccess: (token) => {
      // Se escribe el valor nuevo en el cache en vez de invalidar: la RPC ya
      // devolvió el token, y un refetch sería un round-trip para traer lo que
      // ya tenemos.
      queryClient.setQueryData(calendarFeedQueryOptions(workspaceId).queryKey, token)
      // `last_accessed_at` sí necesita el round-trip (0094): la RPC no
      // devuelve esa columna, solo el token.
      if (userId) void queryClient.invalidateQueries({ queryKey: calendarFeedAccessQueryOptions(userId).queryKey })
      toast.success('Enlace regenerado. El anterior dejó de funcionar.')
    },
    onError: () => toast.error('No se pudo regenerar el enlace.'),
  })
}
