import { supabase } from '@/lib/supabase'
import { authorizedFetch, readJsonBody } from '@/lib/api-fetch'

export async function createWorkspaceWithDefaults(name: string) {
  const { data, error } = await supabase.rpc('create_workspace_with_defaults', {
    p_name: name,
  })
  if (error) throw error
  // La RPC devuelve `table(workspace_id, project_id)`, o sea un array. Sin esta
  // comprobación el tipo era `… | undefined` y el llamador leía `.project_id`
  // de algo que podía no existir — un array vacío significa que la RPC no
  // insertó nada, y navegar a `/p/undefined/board` sería peor que fallar acá.
  const created = data[0]
  if (!created) throw new Error('No se pudo crear el workspace.')
  return created
}

export async function inviteMember(workspaceId: string, email: string, role: string) {
  const res = await authorizedFetch('/api/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, email, role }),
  })
  const body = await readJsonBody<{ error?: string; invitation?: unknown }>(res, '/api/invite')
  if (!res.ok) throw new Error(body.error ?? 'No se pudo invitar')
  return body.invitation
}

// Nombre del workspace (rediseño de Ajustes PR 7) — sin RPC: `workspaces_
// update_admin` (0003_rls.sql) ya permite este UPDATE directo a admin/owner,
// mismo criterio que uploadWorkspaceBranding/clearWorkspaceBranding un poco
// más abajo (las otras dos columnas editables de `workspaces`).
export async function updateWorkspaceName(workspaceId: string, name: string): Promise<void> {
  const { error } = await supabase.from('workspaces').update({ name }).eq('id', workspaceId)
  if (error) throw error
}

// Revocar una invitación pendiente — sin RPC: `invitations_all_admin`
// (0003_rls.sql, `for all`) ya cubre este UPDATE para admin/owner. No hay
// "reenviar" acá al lado: reenviar es volver a llamar `inviteMember` con el
// mismo correo (0004_invitations.sql: `invite_member` regenera token y
// resetea `expires_at` en conflicto), no una acción propia.
export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.from('invitations').update({ status: 'revoked' }).eq('id', invitationId)
  if (error) throw error
}

export type BrandingKind = 'logo' | 'login_background'

const BRANDING_FILENAME: Record<BrandingKind, string> = {
  logo: 'logo',
  login_background: 'login-bg',
}

// Objeto literal por rama, no una key computada (`{ [BRANDING_COLUMN[kind]]:
// url }`): el generador de tipos de Supabase rechaza un update con firma
// indexada (`RejectExcessProperties` no puede verificar que solo se toquen
// columnas reales), así que hay que escribir cada `.update()` con su forma
// concreta.
function brandingUpdate(kind: BrandingKind, value: string | null): { logo_url: string | null } | { login_background_url: string | null } {
  return kind === 'logo' ? { logo_url: value } : { login_background_url: value }
}

/**
 * Sube el logo o la imagen de fondo del login (0077_workspace_branding.sql).
 *
 * Mismo patrón que `useAdminUploadAvatarMutation` (features/people/
 * mutations.ts): sube al bucket primero, y recién con la URL pública
 * resultante actualiza la columna — `workspaces_update_admin` (RLS, 0003)
 * ya cubre este UPDATE, no hace falta una RPC nueva para eso.
 */
export async function uploadWorkspaceBranding(workspaceId: string, kind: BrandingKind, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${workspaceId}/${BRANDING_FILENAME[kind]}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('branding')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('branding').getPublicUrl(path)
  const url = `${data.publicUrl}?t=${Date.now()}`

  const { error } = await supabase
    .from('workspaces')
    .update(brandingUpdate(kind, url))
    .eq('id', workspaceId)
  if (error) throw error
  return url
}

export async function clearWorkspaceBranding(workspaceId: string, kind: BrandingKind): Promise<void> {
  // Solo limpia la columna, no borra el objeto del bucket: es un archivo
  // chico y sin costo real de mantenerlo huérfano, y borrarlo habría sido
  // una llamada más que puede fallar por separado del `update` — mismo
  // criterio de simplicidad que el resto de las mutaciones de este repo.
  const { error } = await supabase
    .from('workspaces')
    .update(brandingUpdate(kind, null))
    .eq('id', workspaceId)
  if (error) throw error
}
