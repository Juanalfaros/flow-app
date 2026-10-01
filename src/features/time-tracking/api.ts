import { supabase } from '@/lib/supabase'

export interface NewTimeEntryInput {
  nodeId: string
  userId: string
  minutes: number
  entryDate: string
  note?: string | null
}

export async function createTimeEntry(input: NewTimeEntryInput) {
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      node_id: input.nodeId,
      user_id: input.userId,
      minutes: input.minutes,
      entry_date: input.entryDate,
      note: input.note ?? null,
    })
    .select('id, node_id, user_id, minutes, entry_date, note, created_at, user:profiles!time_entries_user_id_fkey(id, full_name, avatar_url)')
    .single()
  if (error) throw error
  return data
}

export async function deleteTimeEntry(entryId: string) {
  const { error } = await supabase.from('time_entries').delete().eq('id', entryId)
  if (error) throw error
}
