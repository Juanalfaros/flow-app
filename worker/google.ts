import { createClient } from '@supabase/supabase-js'
import { localDayBoundsUtc } from './local-time'
import type { Env } from './index'

/**
 * Integración con Google Calendar (lectura).
 *
 * El refresh token nunca llega en claro a Postgres: se cifra acá con AES-GCM
 * y la clave vive como secret del Worker (`GOOGLE_TOKEN_KEY`). Un dump de la
 * base no alcanza para descifrarlo — ver la nota de 0040_google_credentials.sql.
 *
 * Todo el intercambio con Google ocurre en el Worker y nunca en el navegador:
 * `GOOGLE_CLIENT_SECRET` no puede viajar al cliente, y el `code` de OAuth se
 * canjea server-side.
 */

// Solo lectura: la app muestra eventos, no los modifica. Pedir `calendar`
// completo daría permiso de escritura que nunca se usa, y Google lo muestra
// en la pantalla de consentimiento — pedir de más es pedirle a la persona que
// apruebe algo que no hace falta.
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'].join(' ')

const STATE_TTL_MS = 10 * 60 * 1000

// ============================================================
// Criptografía
// ============================================================

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

// El tipo de retorno es `Uint8Array<ArrayBuffer>` y no `Uint8Array` a secas:
// desde TS 5.7 el tipo es genérico sobre su buffer, y el `Uint8Array` sin
// parámetro resuelve a `ArrayBufferLike`, que incluye `SharedArrayBuffer` y no
// satisface el `BufferSource` que exige WebCrypto. Reservar el ArrayBuffer
// explícitamente lo fija.
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const out = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * Deriva claves separadas para cifrar y para firmar, del mismo secret.
 *
 * Reutilizar el mismo material de clave para AES-GCM y para HMAC es una mala
 * práctica conocida: HKDF con un `info` distinto da dos claves independientes,
 * así comprometer una no compromete la otra. Y evita pedir dos secrets al
 * configurar el Worker.
 */
async function deriveKey(
  secret: string,
  info: string,
  algorithm: { name: 'AES-GCM'; length: 256 } | { name: 'HMAC'; hash: 'SHA-256' },
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const master = await crypto.subtle.importKey('raw', base64ToBytes(secret), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(info) },
    master,
    algorithm,
    false,
    usages,
  )
}

async function encryptToken(secret: string, plaintext: string): Promise<string> {
  const key = await deriveKey(secret, 'flow:google-token', { name: 'AES-GCM', length: 256 }, ['encrypt'])
  // IV nuevo por cifrado: reusar uno con AES-GCM rompe la garantía del modo
  // por completo, no solo la de ese mensaje.
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`
}

async function decryptToken(secret: string, stored: string): Promise<string> {
  const [ivPart, ctPart] = stored.split('.')
  if (!ivPart || !ctPart) throw new Error('Formato de token cifrado inválido')
  const key = await deriveKey(secret, 'flow:google-token', { name: 'AES-GCM', length: 256 }, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivPart) },
    key,
    base64ToBytes(ctPart),
  )
  return new TextDecoder().decode(plaintext)
}

/**
 * `state` firmado: ata el callback de Google a la persona que inició el flujo.
 *
 * Sin esto, alguien podría hacer que la víctima complete un flujo con el
 * `code` del atacante y terminar con la cuenta de Google del atacante
 * vinculada a la sesión de la víctima (o al revés). Va firmado y con
 * vencimiento corto porque el callback llega como una navegación del
 * navegador, sin cabecera de autorización que verificar.
 */
async function signState(secret: string, userId: string, workspaceId: string): Promise<string> {
  const payload = bytesToBase64(
    new TextEncoder().encode(JSON.stringify({ userId, workspaceId, exp: Date.now() + STATE_TTL_MS })),
  )
  const key = await deriveKey(secret, 'flow:google-state', { name: 'HMAC', hash: 'SHA-256' }, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${bytesToBase64(new Uint8Array(signature))}`
}

async function verifyState(
  secret: string,
  state: string,
): Promise<{ userId: string; workspaceId: string } | null> {
  const [payload, signature] = state.split('.')
  if (!payload || !signature) return null

  const key = await deriveKey(secret, 'flow:google-state', { name: 'HMAC', hash: 'SHA-256' }, ['verify'])
  // `crypto.subtle.verify` compara en tiempo constante — comparar strings a
  // mano filtraría información por el tiempo de respuesta.
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64ToBytes(signature),
    new TextEncoder().encode(payload),
  )
  if (!valid) return null

  const decoded = JSON.parse(new TextDecoder().decode(base64ToBytes(payload))) as {
    userId: string
    workspaceId: string
    exp: number
  }
  if (Date.now() > decoded.exp) return null
  return { userId: decoded.userId, workspaceId: decoded.workspaceId }
}

// ============================================================
// Identidad del llamador
// ============================================================

/**
 * Resuelve quién llama a partir de su JWT, igual que hace `/api/invite`.
 *
 * Devuelve también el cliente con la sesión de esa persona, para poder
 * consultar con SU permiso y no con `service_role` — que saltea la RLS.
 */
function userClient(env: Env, authHeader: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
}

async function requireUser(
  request: Request,
  env: Env,
): Promise<{ id: string; client: ReturnType<typeof userClient> } | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return null
  const client = userClient(env, authHeader)
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return { id: data.user.id, client }
}

function admin(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}

function missingConfig(env: Env): boolean {
  return !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_TOKEN_KEY
}

// ============================================================
// 1. Iniciar el flujo
// ============================================================
// POST y no un redirect directo: el `state` se firma con la identidad de quien
// llama, y esa identidad viene del JWT en la cabecera — que una navegación del
// navegador no puede enviar. El cliente recibe la URL y navega él.
export async function handleGoogleStart(request: Request, env: Env): Promise<Response> {
  if (missingConfig(env)) {
    return Response.json({ error: 'La integración con Google no está configurada.' }, { status: 503 })
  }

  const user = await requireUser(request, env)
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  let body: { workspaceId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  if (!body.workspaceId) return Response.json({ error: 'Falta workspaceId' }, { status: 400 })

  // El `workspaceId` viene del cliente y termina guardado en la fila, así que
  // se valida con la sesión de quien llama antes de firmarlo dentro del
  // `state` — a partir de ahí el callback lo da por bueno. Escribe el Worker
  // con `service_role`, que saltea la RLS: si esto no chequea, nada lo hace.
  const { data: isMember } = await user.client.rpc('is_member_of', { p_workspace_id: body.workspaceId })
  if (isMember !== true) return Response.json({ error: 'No autorizado' }, { status: 403 })

  const origin = new URL(request.url).origin
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: 'code',
    scope: SCOPES,
    // `offline` es lo que hace que Google entregue un refresh token; sin él
    // solo llega un access token de una hora y la integración se cae sola.
    access_type: 'offline',
    // Google omite el refresh token si la persona ya autorizó antes. `consent`
    // fuerza que lo vuelva a entregar — sin esto, reconectar después de
    // desconectar guardaría una credencial sin refresh token.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: await signState(env.GOOGLE_TOKEN_KEY, user.id, body.workspaceId),
  })

  return Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
}

// ============================================================
// 2. Callback de Google
// ============================================================
export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const origin = url.origin
  // Se vuelve siempre al perfil, con el resultado en el query — es una
  // navegación del navegador, no un fetch, así que no hay dónde mostrar un
  // JSON de error.
  const back = (status: string) => Response.redirect(`${origin}/profile?google=${status}`, 302)

  if (missingConfig(env)) return back('no-config')
  if (url.searchParams.get('error')) return back('cancelado')

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return back('invalido')

  // `verifyState` puede lanzar (no solo devolver null): `atob` (dentro de
  // `base64ToBytes`) rechaza con `InvalidCharacterError` un `state` que no
  // es base64 válido, y eso pasa antes de cualquier chequeo de forma —
  // sin este try/catch, un `state` malformado hacía que el Worker
  // respondiera 500 en vez del redirect con motivo que el resto de esta
  // función siempre garantiza (auditoría de seguridad 2026-09-16, S7).
  let verified: { userId: string; workspaceId: string } | null
  try {
    verified = await verifyState(env.GOOGLE_TOKEN_KEY, state)
  } catch {
    return back('invalido')
  }
  if (!verified) return back('expirado')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    // Nunca se loguea el cuerpo: puede traer tokens.
    console.error('Google token exchange failed:', tokenRes.status)
    return back('error')
  }

  const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; scope?: string }
  if (!tokens.refresh_token) {
    // Pasa si la persona ya había autorizado y Google decidió no reenviarlo.
    // Con `prompt=consent` no debería ocurrir, pero guardar una fila sin
    // refresh token dejaría una integración que muere en una hora.
    console.error('Google no devolvió refresh_token')
    return back('sin-refresh')
  }

  const email = await fetchGoogleEmail(tokens.access_token)

  const { error } = await admin(env)
    .from('google_credentials')
    .upsert({
      user_id: verified.userId,
      workspace_id: verified.workspaceId,
      google_email: email ?? 'desconocido',
      refresh_token_encrypted: await encryptToken(env.GOOGLE_TOKEN_KEY, tokens.refresh_token),
      scope: tokens.scope ?? SCOPES,
      connected_at: new Date().toISOString(),
    })

  if (error) {
    console.error('No se pudo guardar la credencial de Google:', error.message)
    return back('error')
  }

  return back('conectado')
}

async function fetchGoogleEmail(accessToken: string | undefined): Promise<string | null> {
  if (!accessToken) return null
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const info = (await res.json()) as { email?: string }
  return info.email ?? null
}

// ============================================================
// 3. Próximos eventos
// ============================================================
// El access token no se guarda: dura una hora y pedir uno nuevo con el refresh
// token cuesta un request. Guardarlo obligaría a manejar su vencimiento y
// sumaría un secreto más en la base, a cambio de ahorrar una llamada.
export async function handleGoogleEvents(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (missingConfig(env)) return Response.json({ events: [], configured: false })

  const user = await requireUser(request, env)
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const { data: row } = await admin(env)
    .from('google_credentials')
    .select('refresh_token_encrypted')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!row) return Response.json({ events: [], connected: false })

  let accessToken: string
  try {
    accessToken = await refreshAccessToken(env, row.refresh_token_encrypted)
  } catch (err) {
    console.error('No se pudo refrescar el token de Google:', err instanceof Error ? err.message : 'desconocido')
    // El refresh token puede haber sido revocado desde la cuenta de Google.
    // Se informa como "desconectado" para que la UI ofrezca reconectar, en vez
    // de mostrar un error que no explica qué hacer.
    return Response.json({ events: [], connected: false, revoked: true })
  }

  // `?range=today`: agenda de Inicio (mockup "Resumen del día"), que
  // necesita SOLO los eventos de hoy en la zona horaria de la persona, no
  // "los próximos 10" — el comportamiento de siempre (sin el parámetro),
  // que sigue usando GoogleCalendarSection/GoogleUpcomingEvents, no cambia.
  const today = new URL(request.url).searchParams.get('range') === 'today'

  const params = new URLSearchParams({
    singleEvents: 'true', // expande los recurrentes en ocurrencias concretas
    orderBy: 'startTime',
  })
  if (today) {
    const { data: profile } = await user.client.from('profiles').select('timezone').eq('id', user.id).maybeSingle()
    const { startUtc, endUtc } = localDayBoundsUtc(new Date(), profile?.timezone ?? 'America/Santiago')
    params.set('timeMin', startUtc.toISOString())
    params.set('timeMax', endUtc.toISOString())
    params.set('maxResults', '30')
  } else {
    params.set('timeMin', new Date().toISOString())
    params.set('maxResults', '10')
  }
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    console.error('Google Calendar API falló:', res.status)
    return Response.json({ error: 'No se pudieron obtener los eventos' }, { status: 502 })
  }

  const payload = (await res.json()) as {
    items?: {
      id: string
      summary?: string
      htmlLink?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
    }[]
  }

  // `ctx.waitUntil` y no un `void` suelto: las queries de supabase-js son
  // lazy — no se envían hasta que alguien las espera, así que un `void` no
  // habría escrito nunca. Y aun enviándose, el Worker puede terminar antes de
  // que la respuesta vuelva. Va fuera del camino crítico porque
  // `last_synced_at` es para diagnóstico: que falle no debe romper la lectura.
  // El `async` envolvente no es adorno: el builder de supabase-js es un
  // `PromiseLike`, no una `Promise`, y `waitUntil` exige lo segundo.
  ctx.waitUntil(
    (async () => {
      const { error } = await admin(env)
        .from('google_credentials')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (error) console.error('No se pudo actualizar last_synced_at:', error.message)
    })(),
  )

  return Response.json({
    connected: true,
    events: (payload.items ?? []).map((e) => ({
      id: e.id,
      title: e.summary ?? '(sin título)',
      // `date` en vez de `dateTime` significa evento de día completo.
      startsAt: e.start?.dateTime ?? e.start?.date ?? null,
      endsAt: e.end?.dateTime ?? e.end?.date ?? null,
      allDay: !e.start?.dateTime,
      link: e.htmlLink ?? null,
    })),
  })
}

async function refreshAccessToken(env: Env, encrypted: string): Promise<string> {
  const refreshToken = await decryptToken(env.GOOGLE_TOKEN_KEY, encrypted)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`refresh falló con ${res.status}`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('respuesta sin access_token')
  return data.access_token
}

// ============================================================
// 4. Desconectar
// ============================================================
// Revoca del lado de Google además de borrar la fila. Sin la revocación, la
// app deja de tener el token pero el permiso sigue concedido en la cuenta de
// la persona — que es lo que casi nadie va a ir a limpiar a mano.
export async function handleGoogleDisconnect(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const client = admin(env)
  const { data: row } = await client
    .from('google_credentials')
    .select('refresh_token_encrypted')
    .eq('user_id', user.id)
    .maybeSingle()

  if (row && env.GOOGLE_TOKEN_KEY) {
    try {
      const refreshToken = await decryptToken(env.GOOGLE_TOKEN_KEY, row.refresh_token_encrypted)
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      })
    } catch {
      // Si la revocación falla igual se borra la fila: dejar la credencial
      // guardada porque Google no respondió sería lo peor de los dos mundos.
    }
  }

  const { error } = await client.from('google_credentials').delete().eq('user_id', user.id)
  if (error) return Response.json({ error: 'No se pudo desconectar' }, { status: 500 })

  return Response.json({ ok: true })
}
