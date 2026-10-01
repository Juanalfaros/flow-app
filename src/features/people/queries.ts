import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

export type PersonProfile = Pick<
  ProfileRow,
  'id' | 'full_name' | 'avatar_url' | 'email' | 'job_title' | 'timezone' | 'manager_id' | 'last_seen_at' | 'created_at'
>

export interface Person extends PersonProfile {
  /** Rol en el workspace: 'owner' | 'admin' | 'member' | 'guest'. */
  role: string
}

/**
 * Personas del workspace con los datos de organización.
 *
 * Query aparte de `workspaceMembersQueryOptions` (features/workspace) y no una
 * extensión de aquella: esa la consumen la asignación de tareas, los
 * comentarios y el command palette, donde solo hace falta nombre y avatar.
 * Sumarle cargo, zona horaria y jerarquía haría que cada una de esas vistas
 * cargue campos que no usa. Acá, en cambio, son el contenido principal.
 */
export const peopleQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['people', workspaceId] as const,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from('memberships')
        .select(
          `
          role,
          profile:profiles (
            id, full_name, avatar_url, email, job_title, timezone,
            manager_id, last_seen_at, created_at
          )
        `,
        )
        .eq('workspace_id', workspaceId)
      if (error) throw error

      // El embed puede venir null si el perfil fue borrado pero la membresía
      // no: se descartan esas filas en vez de renderizar una tarjeta vacía.
      return (data ?? [])
        .flatMap((row) => {
          const profile = row.profile as PersonProfile | null
          return profile ? [{ ...profile, role: row.role }] : []
        })
        .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'es'))
    },
    enabled: !!workspaceId,
  })

export function usePeople(workspaceId: string) {
  return useQuery(peopleQueryOptions(workspaceId))
}

export function usePerson(workspaceId: string, userId: string | null) {
  const { data: people, ...rest } = usePeople(workspaceId)
  return { ...rest, data: userId ? people?.find((p) => p.id === userId) : undefined }
}

/**
 * Hora local de una persona, según su `timezone` IANA.
 *
 * Devuelve null si no tiene zona configurada — el panel omite la línea en vez
 * de mostrar la hora de quien mira, que sería un dato falso presentado como si
 * fuera del otro.
 */
export function formatLocalTime(timezone: string | null, now: Date = new Date()): string | null {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(now)
  } catch {
    // Una zona inválida (dato viejo, o un identificador que el runtime no
    // conoce) lanza RangeError. Se trata como "sin zona" en vez de tumbar la
    // ficha entera.
    return null
  }
}
