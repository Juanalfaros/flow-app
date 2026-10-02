import { supabase } from '@/lib/supabase'
import { authorizedFetch, readJsonBody } from '@/lib/api-fetch'

export interface AdminWorkspace {
  id: string
  name: string
  created_at: string
  owner_email: string | null
  members: number
  tasks: number
  storage_bytes: number
}

export interface AdminOwner {
  user_id: string
  email: string | null
  max_workspaces: number
  workspaces: number
}

export interface AdminInvitation {
  id: string
  email: string
  max_workspaces: number
  status: string
  expires_at: string
}

export interface AdminOverview {
  max_total_workspaces: number
  workspaces: AdminWorkspace[]
  owners: AdminOwner[]
  invitations: AdminInvitation[]
}

export async function fetchIsPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) throw error
  return data === true
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw error
  return data as unknown as AdminOverview
}

export async function inviteOwner(email: string, maxWorkspaces: number) {
  const res = await authorizedFetch('/api/admin/invite-owner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, maxWorkspaces }),
  })
  const body = await readJsonBody<{ error?: string; alreadyRegistered?: boolean }>(res, '/api/admin/invite-owner')
  if (!res.ok) throw new Error(body.error ?? 'No se pudo invitar')
  return body
}

export async function revokeOwnerInvitation(id: string) {
  const { error } = await supabase.rpc('admin_revoke_owner_invitation', { p_id: id })
  if (error) throw error
}

export async function setOwnerQuota(userId: string, max: number) {
  const { error } = await supabase.rpc('admin_set_owner_quota', { p_user_id: userId, p_max_workspaces: max })
  if (error) throw error
}

export async function setTotalLimit(max: number) {
  const { error } = await supabase.rpc('admin_set_total_limit', { p_max: max })
  if (error) throw error
}

export async function deleteWorkspace(workspaceId: string, confirmName: string) {
  const { error } = await supabase.rpc('admin_delete_workspace', {
    p_workspace_id: workspaceId,
    p_confirm_name: confirmName,
  })
  if (error) throw error
}
