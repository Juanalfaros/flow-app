import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const membershipsQueryOptions = () =>
  queryOptions({
    queryKey: ['memberships'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, workspace_id, role, workspace:workspaces(id, name, slug, logo_url, login_background_url)')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })

export function useMemberships() {
  return useQuery(membershipsQueryOptions())
}

/**
 * El workspace "actual" del usuario.
 *
 * Hoy devuelve siempre el primero: no hay selector de workspace en la UI, y
 * `membershipsQueryOptions` ordena por `created_at` asc, así que "el primero"
 * es de forma estable el más antiguo. Un usuario invitado a un segundo
 * workspace solo ve el primero, sin ninguna señal de que existe otro — es una
 * limitación conocida, no un bug de esta función.
 *
 * Existe para que ese día sea un cambio en UN archivo: el patrón
 * `memberships?.[0]?.workspace_id ?? ''` estaba copiado en 13 archivos
 * (rutas, Sidebar, CommandPalette, NotificationBell, realtime…), y cada copia
 * habría que encontrarla y actualizarla a mano.
 *
 * Devuelve `''` (no undefined) cuando todavía no cargó, porque todos los
 * consumidores lo pasan a queries con `enabled: !!workspaceId`.
 */
export function useCurrentWorkspace() {
  const { data: memberships, ...rest } = useMemberships()
  const membership = memberships?.[0]
  return {
    ...rest,
    membership,
    workspaceId: membership?.workspace_id ?? '',
    workspace: membership?.workspace,
    role: membership?.role,
  }
}

export interface LoginBranding {
  logo_url: string | null
  login_background_url: string | null
}

/**
 * Logo y fondo de la pantalla de login (0077_workspace_branding.sql).
 *
 * A diferencia de todo lo demás en este archivo, corre SIN sesión: el login
 * es la única pantalla que se ve antes de autenticarse. `workspaces_select`
 * (RLS) exige ser miembro, así que la lectura pasa por `get_login_branding`,
 * una función pública (mismo criterio que `is_signup_open`) en vez de la
 * tabla directo.
 */
export const loginBrandingQueryOptions = () =>
  queryOptions({
    queryKey: ['login-branding'] as const,
    queryFn: async (): Promise<LoginBranding | null> => {
      const { data, error } = await supabase.rpc('get_login_branding').maybeSingle()
      if (error) throw error
      return data as LoginBranding | null
    },
    // Cambia rarísima vez (un admin lo sube una vez y listo) y se pide sin
    // sesión en cada carga de /login — no hay motivo para revalidarlo cada
    // vez que la pestaña vuelve a foco.
    staleTime: 5 * 60 * 1000,
  })

export function useLoginBranding() {
  return useQuery(loginBrandingQueryOptions())
}

// `spaces` era su propia tabla, ahora son `nodes` con type='space' (ver
// PLAN.md §4.1). `name:title` alias: el consumidor (NewProjectDialog vía
// el picker de space) sigue leyendo `.name`, sin acoplarse al nombre real
// de la columna.
export const spacesQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['spaces', workspaceId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nodes')
        .select('id, name:title, workspace_id')
        .eq('workspace_id', workspaceId)
        .eq('type', 'space')
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

export function useSpaces(workspaceId: string) {
  return useQuery(spacesQueryOptions(workspaceId))
}

export const workspaceMembersQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['workspace-members', workspaceId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('user_id, profile:profiles(id, full_name, avatar_url)')
        .eq('workspace_id', workspaceId)
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

export function useWorkspaceMembers(workspaceId: string) {
  return useQuery(workspaceMembersQueryOptions(workspaceId))
}

export const invitationsQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryKey: ['invitations', workspaceId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, role, status, created_at, expires_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!workspaceId,
  })

export function useInvitations(workspaceId: string) {
  return useQuery(invitationsQueryOptions(workspaceId))
}

// Modelada como query (no mutation) a propósito: se llama vía
// `ensureQueryData` en el beforeLoad de `_app`, y `staleTime: Infinity`
// hace que corra una sola vez por sesión de pestaña en vez de en cada
// navegación (el beforeLoad del layout corre en cada ruta hija).
export const acceptPendingInvitationsQueryOptions = () =>
  queryOptions({
    queryKey: ['accept-pending-invitations'] as const,
    queryFn: async () => {
      const { error } = await supabase.rpc('accept_pending_invitations')
      if (error) throw error
      // Invitaciones para crear un workspace propio (0095_platform_admin.sql).
      // Va después y por separado: no depende de la anterior.
      const { error: ownerError } = await supabase.rpc('accept_owner_invitations')
      if (ownerError) throw ownerError
      return true
    },
    staleTime: Infinity,
  })
