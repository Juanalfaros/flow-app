import { useEffect } from 'react'
import { useProfile } from '@/features/profile/queries'
import { setWeekStartsOn } from '@/features/calendar/date-utils'

// Sincroniza `profiles.week_starts_on` (0058_profile_preferences.sql) hacia
// el estado mutable de date-utils.ts al cargar la app — ver el comentario
// de `weekStartsOnPreference` ahí sobre por qué es un módulo mutable y no
// un parámetro threadeado por cada función de calendario.
export function useSyncWeekStart(userId: string) {
  const { data: profile } = useProfile(userId)
  useEffect(() => {
    if (profile?.week_starts_on === 0 || profile?.week_starts_on === 1) {
      setWeekStartsOn(profile.week_starts_on)
    }
  }, [profile?.week_starts_on])
}
