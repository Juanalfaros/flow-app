import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

// Matriz evento × canal (0092_notification_preferences.sql, rediseño de
// Ajustes PR 3). Los 6 eventos que expone el mockup — deliberadamente sin
// `watched_activity`/`removed_from_workspace`/`role_changed`/`welcome`, ver
// el comentario de la migración.
export const NOTIFICATION_EVENTS = ['assigned', 'mention', 'comment', 'status_changed', 'unblocked', 'due_reminder'] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export const NOTIFICATION_EVENT_LABEL: Record<NotificationEvent, { title: string; hint?: string }> = {
  assigned: { title: 'Te asignan una tarea' },
  mention: { title: 'Te mencionan', hint: 'en un comentario o una descripción' },
  comment: { title: 'Comentan en una tarea tuya' },
  status_changed: { title: 'Cambia el estado de algo que sigues' },
  unblocked: { title: 'Se desbloquea una tarea que esperabas', hint: 'su tarea previa se completó' },
  due_reminder: { title: 'Recordatorio de vencimiento' },
}

export interface NotificationPreferenceRow {
  event: NotificationEvent
  push: boolean
  email: boolean
}

export const notificationPreferencesQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['notification-preferences', userId] as const,
    queryFn: async (): Promise<NotificationPreferenceRow[]> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('event, push, email')
        .eq('user_id', userId as string)
      if (error) throw error
      return data as NotificationPreferenceRow[]
    },
    enabled: !!userId,
  })

export function useNotificationPreferences(userId: string | undefined) {
  return useQuery(notificationPreferencesQueryOptions(userId))
}

/** Sin fila para un evento = default push=true, email=false — mismo
 *  default que aplica worker/push-dispatch.ts al entregar. Se repite acá
 *  para que la matriz no parpadee "todo apagado" mientras carga. */
export function resolvePreference(rows: NotificationPreferenceRow[] | undefined, event: NotificationEvent): { push: boolean; email: boolean } {
  const row = rows?.find((r) => r.event === event)
  return { push: row?.push ?? true, email: row?.email ?? false }
}

export function useSetNotificationPreferenceMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  const key = notificationPreferencesQueryOptions(userId).queryKey

  return useMutation({
    mutationFn: async (vars: { event: NotificationEvent; channel: 'push' | 'email'; value: boolean }) => {
      // Upsert con el valor ACTUAL del otro canal (no el default de la
      // columna): sin esto, tocar "Push" para un evento que ya tenía
      // "Correo" en true lo habría vuelto a false al crear la fila.
      const current = queryClient.getQueryData<NotificationPreferenceRow[]>(key)
      const existing = resolvePreference(current, vars.event)
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          { user_id: userId as string, event: vars.event, ...existing, [vars.channel]: vars.value },
          { onConflict: 'user_id,event' },
        )
      if (error) throw error
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<NotificationPreferenceRow[]>(key)
      queryClient.setQueryData<NotificationPreferenceRow[]>(key, (old) => {
        const existing = resolvePreference(old, vars.event)
        const next: NotificationPreferenceRow = { event: vars.event, ...existing, [vars.channel]: vars.value }
        return [...(old ?? []).filter((r) => r.event !== vars.event), next]
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      toast.error('No se pudo guardar la preferencia.')
    },
  })
}
