import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { listMfaFactors } from '@/features/security/api'

// Sin userId en la key: lee de la sesión activa del cliente (auth.mfa no
// acepta un id ajeno), así que solo puede haber una respuesta válida por
// pestaña — igual que sessionQueryOptions.
export const mfaFactorsQueryOptions = () =>
  queryOptions({
    queryKey: ['mfa-factors'] as const,
    queryFn: listMfaFactors,
  })

export function useMfaFactors() {
  return useQuery(mfaFactorsQueryOptions())
}

export interface AccountDeletionImpact {
  openTasks: number
  openMilestones: number
  pendingReviews: number
}

// "Antes de eliminar, esto es lo que pasa" (Ajustes → Zona de peligro,
// rediseño PR 6) — mismo criterio que myTasksQueryOptions para "abierta"
// (status_kind fuera de success/dropped), sin volumen: son las tareas de
// UNA persona, no hace falta paginar ni cachear con staleTime propio.
export const accountDeletionImpactQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['account-deletion-impact', userId] as const,
    queryFn: async (): Promise<AccountDeletionImpact> => {
      const [tasksRes, reviewsRes] = await Promise.all([
        supabase
          .from('nodes')
          .select('id, is_milestone, status:statuses!nodes_status_id_fkey(status_kind)')
          .eq('type', 'task')
          .eq('assignee_id', userId as string)
          .is('parent_id', null),
        supabase
          .from('task_reviewers')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId as string)
          .eq('status', 'pending'),
      ])
      if (tasksRes.error) throw tasksRes.error
      if (reviewsRes.error) throw reviewsRes.error

      const openTasksRows = (tasksRes.data ?? []) as unknown as {
        id: string
        is_milestone: boolean
        status: { status_kind: string } | null
      }[]
      const open = openTasksRows.filter((t) => t.status?.status_kind !== 'success' && t.status?.status_kind !== 'dropped')

      return {
        openTasks: open.length,
        openMilestones: open.filter((t) => t.is_milestone).length,
        pendingReviews: reviewsRes.count ?? 0,
      }
    },
    enabled: !!userId,
  })

export function useAccountDeletionImpact(userId: string | undefined) {
  return useQuery(accountDeletionImpactQueryOptions(userId))
}
