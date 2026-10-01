import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

// Mismo criterio que describeAccessError (node-access.ts): las 3 RPC de
// abajo exigen ser admin/owner del workspace (assert_admin_of) — un
// miembro común puede ABRIR el diálogo (invitar gente no requiere ser
// admin), así que sin este mensaje el botón "Generar" fallaba en
// silencio para esa persona.
function describePublicLinkError(err: unknown): string {
  const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined
  if (code === '42501') return 'Solo un administrador puede gestionar el link público.'
  return 'No se pudo actualizar el link público.'
}

// El link en sí (para copiarlo) es solo `origin + /enlace/ + token` — no
// hace falta guardar la URL completa en ningún lado, el token alcanza.
export function publicLinkUrl(token: string): string {
  return `${window.location.origin}/enlace/${token}`
}

// Lee la fila de `public_links` directo (RLS ya la acota a admin/owner del
// workspace, mismo criterio que `nodeAccessQueryOptions`) — no hace falta
// una RPC de lectura aparte solo para saber si existe.
export const publicLinkQueryOptions = (nodeId: string) =>
  queryOptions({
    queryKey: ['public-link', nodeId] as const,
    queryFn: async (): Promise<{ token: string; created_at: string } | null> => {
      const { data, error } = await supabase
        .from('public_links')
        .select('token, created_at')
        .eq('node_id', nodeId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!nodeId,
  })

export function usePublicLink(nodeId: string) {
  return useQuery(publicLinkQueryOptions(nodeId))
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, nodeId: string) {
  queryClient.invalidateQueries({ queryKey: publicLinkQueryOptions(nodeId).queryKey })
}

export function useCreatePublicLinkMutation(nodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('get_or_create_public_link', { p_node_id: nodeId })
      if (error) throw error
      return data as string
    },
    onSuccess: () => invalidate(queryClient, nodeId),
    onError: (err) => toast.error(describePublicLinkError(err)),
  })
}

export function useRegeneratePublicLinkMutation(nodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('regenerate_public_link', { p_node_id: nodeId })
      if (error) throw error
      return data as string
    },
    onSuccess: () => invalidate(queryClient, nodeId),
    onError: (err) => toast.error(describePublicLinkError(err)),
  })
}

export function useRevokePublicLinkMutation(nodeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('revoke_public_link', { p_node_id: nodeId })
      if (error) throw error
    },
    onSuccess: () => invalidate(queryClient, nodeId),
    onError: (err) => toast.error(describePublicLinkError(err)),
  })
}

// ============================================================
// "Links públicos que creaste" (Ajustes → Seguridad)
// ============================================================
//
// Sin RPC de lectura aparte, igual que publicLinkQueryOptions: la RLS
// `public_links_select_admin` ya acota a admin/owner del workspace del nodo,
// así que un miembro común simplemente ve la lista vacía (coherente con que
// tampoco puede crear un link — las 3 RPC de arriba exigen lo mismo). Sin
// columna de título en `public_links` (la PK es `node_id`), por eso el join
// con `nodes` para mostrar a qué apunta cada link.
export interface MyPublicLinkRow {
  node_id: string
  token: string
  created_at: string
  last_accessed_at: string | null
  node: { title: string; type: string } | null
}

export const myPublicLinksQueryOptions = (userId: string | undefined) =>
  queryOptions({
    queryKey: ['my-public-links', userId] as const,
    queryFn: async (): Promise<MyPublicLinkRow[]> => {
      const { data, error } = await supabase
        .from('public_links')
        .select('node_id, token, created_at, last_accessed_at, node:nodes(title, type)')
        .eq('created_by', userId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as MyPublicLinkRow[]
    },
    enabled: !!userId,
  })

export function useMyPublicLinks(userId: string | undefined) {
  return useQuery(myPublicLinksQueryOptions(userId))
}

export function useRevokeMyPublicLinkMutation(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (nodeId: string) => {
      const { error } = await supabase.rpc('revoke_public_link', { p_node_id: nodeId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myPublicLinksQueryOptions(userId).queryKey }),
    onError: (err) => toast.error(describePublicLinkError(err)),
  })
}

// ============================================================
// Lado público — sin sesión, consumido por la ruta /enlace/$token
// ============================================================

export interface PublicLinkLabel {
  name: string
  color: string | null
}

export interface PublicLinkTaskRow {
  id: string
  title: string
  status_name: string | null
  status_kind: string | null
  priority: string
  due_date: string | null
  assignee_name: string | null
  labels?: PublicLinkLabel[]
}

export type PublicLinkData =
  | { kind: 'project'; title: string; tasks: PublicLinkTaskRow[] }
  | ({ kind: 'task'; description: string | null; labels: PublicLinkLabel[]; subtasks: PublicLinkTaskRow[] } & Omit<
      PublicLinkTaskRow,
      'labels'
    >)

export async function fetchPublicLinkView(token: string): Promise<PublicLinkData> {
  const res = await fetch(`/api/public-link/${token}`)
  if (res.status === 404) throw new Error('Este link ya no existe o fue desactivado.')
  if (!res.ok) throw new Error('No se pudo cargar el contenido.')
  return (await res.json()) as PublicLinkData
}
