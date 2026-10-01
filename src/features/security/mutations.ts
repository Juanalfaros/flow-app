import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteOwnAccount,
  enrollTotpFactor,
  signOutOtherSessions,
  unenrollFactor,
  verifyTotpFactor,
} from '@/features/security/api'
import { mfaFactorsQueryOptions } from '@/features/security/queries'

export function useEnrollTotpMutation() {
  return useMutation({ mutationFn: enrollTotpFactor })
}

export function useVerifyTotpMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { factorId: string; code: string }) => verifyTotpFactor(vars.factorId, vars.code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaFactorsQueryOptions().queryKey }),
  })
}

export function useUnenrollFactorMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: unenrollFactor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfaFactorsQueryOptions().queryKey }),
  })
}

export function useSignOutOtherSessionsMutation() {
  return useMutation({ mutationFn: signOutOtherSessions })
}

export function useDeleteAccountMutation() {
  return useMutation({ mutationFn: deleteOwnAccount })
}
