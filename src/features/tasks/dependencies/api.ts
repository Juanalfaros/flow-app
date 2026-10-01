import { supabase } from '@/lib/supabase'

export interface TaskDependency {
  id: string
  predecessor_id: string
  successor_id: string
}

// Sin RPC: la validación (mismo workspace, sin ciclos) vive en el `with
// check` de la policy RLS de `task_dependencies` (ver
// 0011_task_scheduling.sql) — un insert que cerraría un ciclo falla acá
// con el error de Postgres para RLS ("new row violates row-level security
// policy"), que el caller traduce a un toast.
export async function addDependency(predecessorId: string, successorId: string): Promise<TaskDependency> {
  const { data, error } = await supabase
    .from('task_dependencies')
    .insert({ predecessor_id: predecessorId, successor_id: successorId })
    .select('id, predecessor_id, successor_id')
    .single()
  if (error) throw error
  return data
}

export async function removeDependency(id: string) {
  const { error } = await supabase.from('task_dependencies').delete().eq('id', id)
  if (error) throw error
}
