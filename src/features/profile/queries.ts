import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const profileQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ['profile', userId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, full_name, email, avatar_url, job_title, last_seen_at, created_at, push_enabled, timezone, theme, default_view, week_starts_on, date_format, time_format, start_page, accent_color, rail_style, weekly_digest_enabled, last_digest_sent_at, digest_day, digest_hour, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_weekends',
        )
        .eq('id', userId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })

export function useProfile(userId: string) {
  return useQuery(profileQueryOptions(userId))
}

// Forma exacta de la fila que devuelve el `.select()` de arriba — más
// angosta que `Database['public']['Tables']['profiles']['Row']` (que trae
// TODAS las columnas, incluidas las que acá no se piden). La usan
// PreferencesSection y cualquier otro consumidor que necesite tipar `profile`
// sin repetir la lista de columnas a mano.
export type ProfileRow = NonNullable<ReturnType<typeof useProfile>['data']>
