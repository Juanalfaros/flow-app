import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { teamQueryOptions, teamsQueryOptions } from '@/features/teams/queries'
import type { Database } from '@/types/database'

type TeamUpdate = Database['public']['Tables']['teams']['Update']

// Las escrituras de equipo son eventos puntuales de administración, no un
// hot-path de UI: se invalida y se refetchea en vez de mantener un patch
// optimista, misma excepción aceptada que documentan las mutations de
// workspace y de labels.
function invalidateTeams(queryClient: ReturnType<typeof useQueryClient>, workspaceId: string, teamId?: string) {
  queryClient.invalidateQueries({ queryKey: teamsQueryOptions(workspaceId).queryKey })
  if (teamId) queryClient.invalidateQueries({ queryKey: teamQueryOptions(teamId).queryKey })
}

// El handle viaja normalizado desde el cliente para que coincida con el índice
// único `(workspace_id, lower(handle))` de 0025 — así el choque se detecta como
// conflicto real y no como dos handles "distintos" que solo difieren en
// mayúsculas o en un espacio de más.
export function normalizeHandle(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function describeTeamError(err: unknown): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined
  if (code === '23505') return 'Ya existe un equipo con ese identificador (@handle).'
  if (code === '42501') return 'Solo un administrador puede gestionar equipos.'
  return 'No se pudo guardar el equipo. Vuelve a intentarlo.'
}

export function useCreateTeamMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { name: string; handle: string; description?: string; color?: string }) => {
      const { data, error } = await supabase
        .from('teams')
        .insert({
          workspace_id: workspaceId,
          name: vars.name.trim(),
          handle: normalizeHandle(vars.handle),
          description: vars.description?.trim() || null,
          color: vars.color ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateTeams(queryClient, workspaceId),
    onError: (err) => toast.error(describeTeamError(err)),
  })
}

export function useUpdateTeamMutation(workspaceId: string, teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: { name?: string; handle?: string; description?: string | null; color?: string | null }) => {
      // Tipado contra el `Update` generado y no un `Record<string, …>`: así un
      // typo en el nombre de columna falla al compilar en vez de irse a la base
      // como una columna inexistente. Se construye por partes para mandar solo
      // lo que cambió — un update con todas las columnas pisaría con `null` lo
      // que el formulario no tocó.
      const patch: TeamUpdate = {}
      if (fields.name !== undefined) patch.name = fields.name.trim()
      if (fields.handle !== undefined) patch.handle = normalizeHandle(fields.handle)
      if (fields.description !== undefined) patch.description = fields.description?.trim() || null
      if (fields.color !== undefined) patch.color = fields.color
      const { error } = await supabase.from('teams').update(patch).eq('id', teamId)
      if (error) throw error
    },
    onSuccess: () => invalidateTeams(queryClient, workspaceId, teamId),
    onError: (err) => toast.error(describeTeamError(err)),
  })
}

export function useDeleteTeamMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (teamId: string) => {
      // `team_members` cascadea por FK (0025), no hace falta borrarlos antes.
      const { error } = await supabase.from('teams').delete().eq('id', teamId)
      if (error) throw error
    },
    onSuccess: () => invalidateTeams(queryClient, workspaceId),
    onError: (err) => toast.error(describeTeamError(err)),
  })
}

export function useSetTeamMembersMutation(workspaceId: string, teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      // Se calcula el delta en vez de borrar todo y reinsertar: un
      // `delete + insert` completo cambiaría el `added_at` de quienes ya
      // estaban, y con la ACL activa dejaría a todo el equipo sin acceso
      // durante el instante entre ambas sentencias.
      const { data: current, error: readError } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
      if (readError) throw readError

      const existing = new Set((current ?? []).map((m) => m.user_id))
      const next = new Set(userIds)
      const toAdd = userIds.filter((id) => !existing.has(id))
      const toRemove = [...existing].filter((id) => !next.has(id))

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('team_members')
          .insert(toAdd.map((user_id) => ({ team_id: teamId, user_id })))
        if (error) throw error
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('team_members')
          .delete()
          .eq('team_id', teamId)
          .in('user_id', toRemove)
        if (error) throw error
      }
    },
    onSuccess: () => invalidateTeams(queryClient, workspaceId, teamId),
    onError: (err) => toast.error(describeTeamError(err)),
  })
}
