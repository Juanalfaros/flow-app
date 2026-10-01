import { createClient } from '@supabase/supabase-js'
import type { Env } from './index'

/**
 * Sirve la proyección de solo lectura de un link público (lista o tarea).
 *
 * El token de la URL es la única credencial: no hay sesión ni JWT. Por eso
 * la RPC que lo resuelve (`public_link_view`) está concedida solo a
 * `service_role` — el Worker no decide autorización, igual que en
 * `handleCalendarFeed`.
 */
export async function handlePublicLink(_request: Request, env: Env, token: string): Promise<Response> {
  // Los tokens son 64 caracteres hex (0085), mismo formato que
  // calendar_feeds (0033). Validar la forma antes de consultar evita
  // convertir la base en un oráculo de fuerza bruta.
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await admin.rpc('public_link_view', { p_token: token })

  if (error) {
    console.error('public_link_view failed:', error.message)
    return Response.json({ error: 'Error' }, { status: 502 })
  }

  // Token inválido o el nodo ya no existe: la función devuelve null sin
  // distinguir el motivo (mismo criterio que calendar_feed_events) — un
  // 404 explícito confirmaría que el token es válido.
  if (data === null) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json(data, {
    headers: {
      // `private, no-store`: el contenido depende del token de la URL, no
      // debe quedar en ninguna caché intermedia ni del navegador.
      'Cache-Control': 'private, no-store',
    },
  })
}
