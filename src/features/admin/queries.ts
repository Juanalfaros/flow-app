import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  deleteWorkspace,
  fetchAdminOverview,
  fetchIsPlatformAdmin,
  inviteOwner,
  revokeOwnerInvitation,
  setOwnerQuota,
  setTotalLimit,
} from '@/features/admin/api'

export const isPlatformAdminQueryOptions = () =>
  queryOptions({
    queryKey: ['is-platform-admin'] as const,
    queryFn: fetchIsPlatformAdmin,
    staleTime: Infinity,
  })

export const adminOverviewQueryOptions = () =>
  queryOptions({
    queryKey: ['admin-overview'] as const,
    queryFn: fetchAdminOverview,
  })

export const useIsPlatformAdmin = () => useQuery(isPlatformAdminQueryOptions()).data === true

export const useAdminOverview = () => useQuery(adminOverviewQueryOptions())

function useAdminMutation<TVars>(fn: (vars: TVars) => Promise<unknown>, success?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success)
      return queryClient.invalidateQueries({ queryKey: adminOverviewQueryOptions().queryKey })
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo completar la acción'),
  })
}

export const useInviteOwner = () =>
  useAdminMutation((v: { email: string; max: number }) => inviteOwner(v.email, v.max), 'Invitación enviada')
export const useRevokeOwnerInvitation = () => useAdminMutation(revokeOwnerInvitation, 'Invitación revocada')
export const useSetOwnerQuota = () =>
  useAdminMutation((v: { userId: string; max: number }) => setOwnerQuota(v.userId, v.max), 'Cuota actualizada')
export const useSetTotalLimit = () => useAdminMutation(setTotalLimit, 'Límite actualizado')
export const useDeleteWorkspace = () =>
  useAdminMutation((v: { id: string; name: string }) => deleteWorkspace(v.id, v.name), 'Workspace eliminado')
