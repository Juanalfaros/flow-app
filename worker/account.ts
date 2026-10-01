import { createClient } from '@supabase/supabase-js'
import type { Env } from './index'

// Elimina la cuenta que llama — nunca una ajena, no recibe un id en el
// body. Mismo esqueleto que requireUser/admin en worker/google.ts: un
// cliente con el JWT reenviado para confirmar identidad (auth.getUser),
// y recién ahí el cliente con Service Role Key para el borrado real.
//
// Sin lógica de reasignación custom: `profiles.id references
// auth.users(id) on delete cascade` (0001_init.sql) dispara el mismo
// grafo de FKs que cada migración ya definió para cualquier baja de
// usuario — no es una decisión nueva de esta fase.
export async function handleDeleteAccount(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error: authError } = await userClient.auth.getUser()
  if (authError || !data.user) {
    return Response.json({ error: 'Sesión inválida' }, { status: 401 })
  }

  const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(data.user.id)
  if (deleteError) {
    console.error('deleteUser failed:', deleteError.message)
    return Response.json({ error: 'No se pudo eliminar la cuenta' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
