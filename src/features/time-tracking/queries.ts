import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export interface TimeEntrySummary {
  id: string
  node_id: string
  user_id: string
  minutes: number
  entry_date: string
  note: string | null
  created_at: string
  user: Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'full_name' | 'avatar_url'> | null
}

export const timeEntriesQueryOptions = (nodeId: string) =>
  queryOptions({
    queryKey: ['time-entries', nodeId] as const,
    queryFn: async (): Promise<TimeEntrySummary[]> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select(
          'id, node_id, user_id, minutes, entry_date, note, created_at, user:profiles!time_entries_user_id_fkey(id, full_name, avatar_url)',
        )
        .eq('node_id', nodeId)
        // Más reciente primero — a diferencia de comments (cronológico
        // ascendente, es un hilo de conversación), acá lo que importa al
        // abrir la tarea es "qué se cargó último", no el orden de un relato.
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!nodeId,
  })

export function useTimeEntries(nodeId: string) {
  return useQuery(timeEntriesQueryOptions(nodeId))
}
