import { createClient } from '@supabase/supabase-js'
import type { Env } from './index'

interface InviteOwnerBody {
  email: string
  maxWorkspaces?: number
}

// Invita a alguien a crear su PROPIO workspace (administración de plataforma,
// 0095_platform_admin.sql). Mismo patrón que /api/invite: la autorización la
// decide la RPC (`admin_invite_owner` exige ser super admin), el Worker solo
// manda el correo con service_role después de que la base aceptó.
export async function handleAdminInviteOwner(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  let body: InviteOwnerBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.email) {
    return Response.json({ error: 'Missing email' }, { status: 400 })
  }

  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { error: rpcError } = await userClient.rpc('admin_invite_owner', {
    p_email: body.email,
    p_max_workspaces: body.maxWorkspaces ?? 1,
  })
  if (rpcError) {
    console.error('admin_invite_owner rpc failed:', rpcError.message)
    return Response.json({ error: 'No se pudo invitar a esta persona' }, { status: 403 })
  }

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const origin = new URL(request.url).origin
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(body.email, {
    redirectTo: `${origin}/accept-invite`,
  })

  // Si la persona ya tiene cuenta no se le puede "invitar" de nuevo: la
  // invitación de owner queda registrada y se activa en su próximo ingreso.
  if (inviteError && !inviteError.message.toLowerCase().includes('already registered')) {
    console.error('inviteUserByEmail failed:', inviteError.message)
    return Response.json({ error: 'No se pudo enviar el correo de invitación' }, { status: 502 })
  }

  return Response.json({ ok: true, alreadyRegistered: !!inviteError })
}
