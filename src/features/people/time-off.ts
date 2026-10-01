import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isWithinInterval, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type TimeOffRow = Database['public']['Tables']['time_off']['Row']

export const TIME_OFF_KIND_LABEL: Record<string, string> = {
  vacaciones: 'Vacaciones',
  licencia: 'Licencia',
  otro: 'Otro',
}

// Una sola query por workspace, no una por persona: son pocas filas y la ficha
// de cada quien filtra sobre la misma cache. Pedir por `user_id` haría un
// request nuevo cada vez que se abre un panel distinto.
export const timeOffQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['time-off', workspaceId] as const,
    queryFn: async (): Promise<TimeOffRow[]> => {
      const { data, error } = await supabase
        .from('time_off')
        .select('id, workspace_id, user_id, starts_on, ends_on, kind, note, created_at')
        .eq('workspace_id', workspaceId)
        .order('starts_on', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

export function useTimeOff(workspaceId: string) {
  return useQuery(timeOffQueryOptions(workspaceId))
}

export function usePersonTimeOff(workspaceId: string, userId: string) {
  const { data, ...rest } = useTimeOff(workspaceId)
  return { ...rest, data: data?.filter((t) => t.user_id === userId) }
}

/**
 * ¿Está fuera hoy?
 *
 * `parseISO` y no `new Date(string)`: las fechas son "YYYY-MM-DD" sin hora, y
 * `new Date()` las interpreta como medianoche UTC, corriendo el día hacia atrás
 * en husos negativos — el mismo motivo documentado en calendar/date-utils.ts.
 * Con Chile en UTC-3/-4, alguien de vacaciones hasta hoy aparecería como
 * disponible.
 */
export function isAwayOn(rows: TimeOffRow[], date: Date = new Date()): TimeOffRow | null {
  return (
    rows.find((r) => isWithinInterval(date, { start: parseISO(r.starts_on), end: parseISO(r.ends_on) })) ?? null
  )
}

function describeTimeOffError(err: unknown): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined
  if (code === '42501') return 'Solo puedes registrar tus propias ausencias.'
  if (code === '23514') return 'La fecha de término no puede ser anterior a la de inicio.'
  return 'No se pudo guardar la ausencia.'
}

export function useCreateTimeOffMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { userId: string; startsOn: string; endsOn: string; kind: string; note?: string }) => {
      const { error } = await supabase.from('time_off').insert({
        workspace_id: workspaceId,
        user_id: vars.userId,
        starts_on: vars.startsOn,
        ends_on: vars.endsOn,
        kind: vars.kind,
        note: vars.note?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeOffQueryOptions(workspaceId).queryKey }),
    onError: (err) => toast.error(describeTimeOffError(err)),
  })
}

export function useUpdateTimeOffMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: string; startsOn: string; endsOn: string; kind: string; note?: string }) => {
      const { error } = await supabase
        .from('time_off')
        .update({ starts_on: vars.startsOn, ends_on: vars.endsOn, kind: vars.kind, note: vars.note?.trim() || null })
        .eq('id', vars.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeOffQueryOptions(workspaceId).queryKey }),
    onError: (err) => toast.error(describeTimeOffError(err)),
  })
}

export function useDeleteTimeOffMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('time_off').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: timeOffQueryOptions(workspaceId).queryKey }),
    onError: (err) => toast.error(describeTimeOffError(err)),
  })
}
