import { createClient } from '@supabase/supabase-js'
import type { Env } from './index'

interface InviteBody {
  workspaceId: string
  email: string
  role: string
}

export async function handleInvite(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  let body: InviteBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.workspaceId || !body.email || !body.role) {
    return Response.json({ error: 'Missing workspaceId, email or role' }, { status: 400 })
  }

  // Cliente con el token del usuario que llama: respeta RLS. La RPC valida
  // is_admin_of server-side — el Worker no decide autorización por sí mismo.
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: invitation, error: rpcError } = await userClient.rpc('invite_member', {
    p_workspace_id: body.workspaceId,
    p_email: body.email,
    p_role: body.role,
  })

  if (rpcError) {
    // Mensaje fijo, detalle solo al log: `invite_member` lanza excepciones de
    // plpgsql ('Solo admin/owner puede invitar miembros', 'Rol inválido: %') y
    // cualquier otro fallo llega con el texto crudo de Postgres — nombres de
    // función, de constraint y de columna incluidos. El cliente solo necesita
    // saber que no se pudo.
    console.error('invite_member rpc failed:', rpcError.message)
    return Response.json({ error: 'No se pudo invitar a esta persona' }, { status: 403 })
  }

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const origin = new URL(request.url).origin

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(body.email, {
    redirectTo: `${origin}/accept-invite`,
  })

  if (inviteError && !inviteError.message.toLowerCase().includes('already registered')) {
    console.error('inviteUserByEmail failed:', inviteError.message)
    return Response.json({ error: 'No se pudo enviar el correo de invitación' }, { status: 502 })
  }

  return Response.json({ invitation })
}
