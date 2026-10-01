import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  createWorkspaceWithDefaults,
  inviteMember,
  revokeInvitation,
  updateWorkspaceName,
  uploadWorkspaceBranding,
  clearWorkspaceBranding,
  type BrandingKind,
} from '@/features/workspace/api'
import { invitationsQueryOptions, membershipsQueryOptions, loginBrandingQueryOptions } from '@/features/workspace/queries'

export function useCreateWorkspaceMutation() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: createWorkspaceWithDefaults,
    onSuccess: (result) => {
      // excepción aceptada a "no invalidar": evento de una sola vez (onboarding),
      // no un hot-path de UI.
      queryClient.invalidateQueries({ queryKey: membershipsQueryOptions().queryKey })
      navigate({ to: '/p/$projectId/board', params: { projectId: result.project_id } })
    },
  })
}

// Solo admin/owner llega a montar esto (gate en la UI, WorkspaceSection de
// profile.tsx); `workspaces_update_admin` (RLS) es la barrera real. Mismo
// criterio de invalidación que useUploadWorkspaceBrandingMutation: el
// nombre se lee de `membershipsQueryOptions` (`membership.workspace.name`),
// no de `loginBrandingQueryOptions` (esa solo trae logo/fondo).
export function useUpdateWorkspaceNameMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => updateWorkspaceName(workspaceId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membershipsQueryOptions().queryKey }),
  })
}

export function useRevokeInvitationMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(invitationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsQueryOptions(workspaceId).queryKey }),
  })
}

export function useInviteMemberMutation(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: { email: string; role: string }) =>
      inviteMember(workspaceId, vars.email, vars.role),
    onSuccess: () => {
      // excepción aceptada: crear una invitación es un evento de una
      // sola vez, no un hot-path de UI.
      queryClient.invalidateQueries({ queryKey: invitationsQueryOptions(workspaceId).queryKey })
    },
  })
}

/**
 * Logo / fondo del login (0077_workspace_branding.sql) — solo admin/owner
 * llega a montar esto (gate en la UI, `BrandingSection` de profile.tsx);
 * `workspaces_update_admin` (RLS) es la barrera real.
 *
 * Invalida `membershipsQueryOptions` (donde vive la preview de Mi perfil)
 * y `loginBrandingQueryOptions` (lo que de verdad pinta /login) — son dos
 * lecturas distintas de las mismas dos columnas, una autenticada y otra
 * pública, sin relación de caché entre sí.
 */
export function useUploadWorkspaceBrandingMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { kind: BrandingKind; file: File }) =>
      uploadWorkspaceBranding(workspaceId, vars.kind, vars.file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: loginBrandingQueryOptions().queryKey })
    },
  })
}

export function useClearWorkspaceBrandingMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (kind: BrandingKind) => clearWorkspaceBranding(workspaceId, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: loginBrandingQueryOptions().queryKey })
    },
  })
}

export interface BulkInviteResult {
  sent: string[]
  failed: { email: string; reason: string }[]
}

/**
 * Invita a varias personas de una vez.
 *
 * `Promise.allSettled` y no `Promise.all`: cada invitación es un request
 * independiente al Worker, y si una falla (correo inválido, ya es miembro, un
 * 502 del proveedor de mail) no hay razón para descartar las que sí salieron.
 * El diálogo informa unas y otras por separado en vez de un "falló todo" que
 * escondería que la mitad ya se envió — y que llevaría a reintentar y mandar
 * invitaciones duplicadas.
 */
export function useInviteMembersMutation(workspaceId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { emails: string[]; role: string }): Promise<BulkInviteResult> => {
      // Cada intento captura su propio correo y resuelve siempre, en vez de
      // `Promise.allSettled` + correlación por índice: el resultado ya viene
      // emparejado con su email, así que no hay que reconstruir esa relación
      // leyendo `vars.emails[i]` — un acceso que el tipo no puede garantizar y
      // que se desincronizaría en silencio si la lista se filtrara antes.
      const outcomes = await Promise.all(
        vars.emails.map(async (email) => {
          try {
            await inviteMember(workspaceId, email, vars.role)
            return { email, ok: true as const }
          } catch (err) {
            return { email, ok: false as const, reason: err instanceof Error ? err.message : 'Error desconocido' }
          }
        }),
      )
      return {
        sent: outcomes.filter((o) => o.ok).map((o) => o.email),
        failed: outcomes.filter((o) => !o.ok).map((o) => ({ email: o.email, reason: o.reason })),
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationsQueryOptions(workspaceId).queryKey })
    },
  })
}
