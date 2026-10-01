import { sendPush, type VapidKeys } from './push'
import { adminClient, buildPayload, type NotificationRecord } from './notification-payload'
import { sendNotificationEmail } from './email-dispatch'
import { isQuietNow } from './local-time'
import type { Env } from './index'

// Entrega de Web Push, con dos puertas de entrada al MISMO camino:
//
//   1. `handlePushDispatch` — Database Webhook de Supabase, dispara al
//      instante cuando se inserta una fila en `notifications`.
//   2. `sweepPendingPushes` — cron del Worker cada minuto, recoge lo que
//      el webhook no logró entregar (Worker reiniciando, 500 pasajero,
//      webhook deshabilitado).
//
// Las dos convergen en `deliverNotification`, y `notifications.pushed_at`
// las hace idempotentes: la fila se marca al entregar, y el filtro
// `is null` impide que el barrido reenvíe lo que el webhook ya mandó.
//
// `pushed_at` sola no alcanza para descartar el duplicado: el webhook lee
// la fila, sale a entregar (y eso tarda), y si el barrido pasa en ese
// intervalo la ve todavía sin marcar y la manda de nuevo. La ventana es
// corta pero real, y el costo es un aviso repetido en el teléfono de
// alguien. Por eso el barrido ignora lo recién creado
// (`SWEEP_MIN_AGE_SECONDS`): le da al webhook su turno antes de
// considerar que falló. Es más simple y más barato que un lock, y el
// precio —hasta dos minutos de retraso en el camino de respaldo— solo lo
// paga lo que ya iba a llegar tarde de todos modos.

/** Tope por corrida del barrido. Con 15 personas el backlog real es de
 *  unas pocas filas; el límite existe para que una caída larga no
 *  intente miles de envíos en la ventana de CPU de una sola invocación. */
const SWEEP_BATCH_SIZE = 50

/** Margen que se le da al webhook antes de que el barrido considere
 *  fallida una notificación. Ver la nota de arriba sobre el duplicado. */
const SWEEP_MIN_AGE_SECONDS = 120

/** El barrido no mira más atrás que esto. Una notificación de hace tres
 *  días ya no es una notificación, es ruido: la persona ya la vio en la
 *  campana o dejó de importarle. Se marcan como enviadas sin enviarlas
 *  para que no queden dando vueltas en el índice parcial. */
const SWEEP_MAX_AGE_MINUTES = 60

interface SubscriptionRecord {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface RecipientProfile {
  push_enabled: boolean
  timezone: string | null
  quiet_hours_enabled: boolean
  quiet_hours_start: number
  quiet_hours_end: number
  quiet_weekends: boolean
}

interface EventPreference {
  push: boolean
  email: boolean
}

function vapidKeys(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return null
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
}

/**
 * Envía una notificación a todos los dispositivos de su destinatario y
 * la marca como entregada.
 *
 * Marca `pushed_at` incluso cuando no había a quién enviar (sin
 * suscripciones, o con el push desactivado en el perfil): la fila está
 * resuelta y reintentarla cada minuto para siempre no cambiaría nada. La
 * única excepción es el horario de silencio (`push_quiet_hold`, más
 * abajo): ahí `pushed_at` queda sin setear a propósito, para que el
 * barrido la reintente cuando la ventana termine.
 *
 * Rediseño de Ajustes, PR 3 (0092_notification_preferences.sql): suma dos
 * gates nuevos, además del `push_enabled` global de siempre —
 *   - `notification_preferences.push` por tipo de evento (sin fila = true,
 *     ninguna cuenta existente cambia hasta tocar la UI nueva).
 *   - horario de silencio (`isQuietNow`, worker/local-time.ts) — solo
 *     pausa Push, nunca la Bandeja (ya se creó la fila igual, antes de
 *     llegar acá) ni el correo por preferencia (ver `emailWanted` abajo).
 * y un canal nuevo: `notification_preferences.email` puede pedir correo
 * para un evento AUNQUE haya push (no solo como respaldo de "sin
 * dispositivos", que sigue existiendo tal cual estaba).
 */
export async function deliverNotification(env: Env, notification: NotificationRecord): Promise<void> {
  const keys = vapidKeys(env)
  if (!keys) {
    console.error('push: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT')
    return
  }

  const client = adminClient(env)

  const [{ data: profile }, { data: pref }] = await Promise.all([
    client
      .from('profiles')
      .select('push_enabled, timezone, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_weekends')
      .eq('id', notification.recipient_id)
      .maybeSingle(),
    client
      .from('notification_preferences')
      .select('push, email')
      .eq('user_id', notification.recipient_id)
      .eq('event', notification.type)
      .maybeSingle(),
  ])

  const prof = profile as RecipientProfile | null
  const eventPref = pref as EventPreference | null
  const pushAllowed = (prof?.push_enabled ?? true) && (eventPref?.push ?? true)
  const emailWanted = eventPref?.email ?? false

  const markEmailed = () => client.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', notification.id)
  const markDone = () =>
    client.from('notifications').update({ pushed_at: new Date().toISOString(), push_quiet_hold: false }).eq('id', notification.id)

  if (!pushAllowed) {
    // Sin push (global o de este tipo de evento) — el correo por
    // preferencia igual puede aplicar, independiente del fallback de "sin
    // dispositivos" (ese solo corre cuando SÍ se intentó mandar push).
    if (emailWanted) {
      const emailed = await sendNotificationEmail(env, notification).catch((err) => {
        console.error('email (preferencia, sin push) threw', notification.id, err)
        return false
      })
      if (emailed) await markEmailed()
    }
    await markDone()
    return
  }

  if (prof && isQuietNow(new Date(), prof)) {
    // El correo por preferencia no espera al horario de silencio: ese
    // control es específico de Push (0092). `pushed_at` queda sin setear
    // — ver el comentario de `push_quiet_hold` en la migración.
    if (emailWanted) {
      const emailed = await sendNotificationEmail(env, notification).catch((err) => {
        console.error('email (preferencia, horario de silencio) threw', notification.id, err)
        return false
      })
      if (emailed) await markEmailed()
    }
    await client.from('notifications').update({ push_quiet_hold: true }).eq('id', notification.id)
    return
  }

  const { data: subscriptions } = await client
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', notification.recipient_id)

  const targets = (subscriptions ?? []) as SubscriptionRecord[]
  if (targets.length === 0) {
    // F5 #10: sin ningún dispositivo con push activo, un correo es mejor
    // que nada — mismo criterio de siempre, ahora también disparado por
    // `emailWanted` si la preferencia lo pide (cualquiera de los dos
    // motivos alcanza, sin mandar dos veces). Falla en silencio (dominio
    // sin dar de alta en Cloudflare Email Sending, binding sin
    // configurar, etc. — ver wrangler.jsonc): `markDone()` corre igual,
    // no hay reintento posible más allá de la próxima notificación real.
    const emailed = await sendNotificationEmail(env, notification).catch((err) => {
      console.error('email fallback threw', notification.id, err)
      return false
    })
    if (emailed) await markEmailed()
    await markDone()
    return
  }

  const payload = JSON.stringify(await buildPayload(client, notification))

  // El correo por preferencia (no el de respaldo de arriba) corre en
  // paralelo con el envío de push: alguien puede querer las dos señales
  // para un evento importante, no solo una u otra.
  const [results, emailedNow] = await Promise.all([
    Promise.all(
      targets.map(async (sub) => {
        const result = await sendPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload, keys)
        return { sub, result }
      }),
    ),
    emailWanted
      ? sendNotificationEmail(env, notification).catch((err) => {
          console.error('email (preferencia, con push) threw', notification.id, err)
          return false
        })
      : Promise.resolve(false),
  ])

  if (emailedNow) await markEmailed()

  // 404/410 = el push service dice que ese endpoint ya no existe (RFC 8030
  // §7.3): navegador desinstalado, datos del sitio borrados, permiso
  // revocado. Es la única señal fiable de muerte, y se actúa al toque —
  // ver la nota al pie de 0050 sobre por qué no se borra por
  // `failure_count`.
  const expired = results.filter((r) => r.result.expired).map((r) => r.sub.id)
  if (expired.length > 0) {
    await client.from('push_subscriptions').delete().in('id', expired)
  }

  const delivered = results.filter((r) => r.result.ok).map((r) => r.sub.id)
  if (delivered.length > 0) {
    await client
      .from('push_subscriptions')
      .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
      .in('id', delivered)
  }

  const failed = results.filter((r) => !r.result.ok && !r.result.expired)
  if (failed.length > 0) {
    // `failure_count` (0050) existía como columna de diagnóstico pero
    // nunca se incrementaba en ningún lado — quedaba siempre en 0. El
    // rediseño de Ajustes PR 3 la muestra en la lista de dispositivos
    // ("3 avisos fallidos seguidos"), así que ahora sí hay que escribirla.
    // Lectura previa (no una expresión atómica): supabase-js no ofrece
    // `failure_count + 1` en `.update()`, y el volumen (unos pocos fallos
    // transitorios por corrida) no justifica una RPC nueva solo para esto.
    const failedIds = failed.map((r) => r.sub.id)
    const { data: currentRows } = await client.from('push_subscriptions').select('id, failure_count').in('id', failedIds)
    const countById = new Map((currentRows ?? []).map((r) => [r.id, r.failure_count]))
    await Promise.all(
      failedIds.map((id) =>
        client
          .from('push_subscriptions')
          .update({ failure_count: (countById.get(id) ?? 0) + 1 })
          .eq('id', id),
      ),
    )
  }
  for (const { sub, result } of failed) {
    console.error(`push: fallo ${result.status} en ${sub.endpoint}`)
  }

  // Si TODOS los envíos fallaron por algo transitorio, la fila queda sin
  // marcar y el barrido la reintenta dentro de un minuto. Si al menos uno
  // llegó, se da por entregada: reintentar castigaría con un duplicado al
  // dispositivo que sí la recibió.
  if (delivered.length > 0 || expired.length === targets.length) {
    await markDone()
  }
}

/**
 * Database Webhook de Supabase sobre INSERT en `notifications`.
 *
 * Se autentica con un secreto compartido en cabecera, no con JWT: quien
 * llama es Postgres, no una persona. El secreto se configura al crear el
 * webhook en el dashboard y como secret del Worker.
 */
export async function handlePushDispatch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const provided = request.headers.get('X-Webhook-Secret')
  if (!env.PUSH_WEBHOOK_SECRET || !provided || !timingSafeEqual(provided, env.PUSH_WEBHOOK_SECRET)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { type?: string; record?: NotificationRecord }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const record = body.record
  if (!record?.id || !record.recipient_id) {
    return Response.json({ error: 'Missing record' }, { status: 400 })
  }

  // Se responde 202 sin esperar el envío: el webhook de Supabase tiene
  // timeout corto, y dejarlo colgado de FCM haría que Postgres lo dé por
  // fallido aunque la notificación haya salido. `waitUntil` mantiene vivo
  // el Worker hasta terminar.
  ctx.waitUntil(deliverNotification(env, record))
  return Response.json({ accepted: true }, { status: 202 })
}

/** Barrido del cron: recoge lo que el webhook no entregó. */
export async function sweepPendingPushes(env: Env): Promise<void> {
  if (!vapidKeys(env)) return

  const client = adminClient(env)
  const now = Date.now()
  const cutoff = new Date(now - SWEEP_MAX_AGE_MINUTES * 60 * 1000).toISOString()
  const graceCutoff = new Date(now - SWEEP_MIN_AGE_SECONDS * 1000).toISOString()

  // `push_quiet_hold` (0092): una notificación retenida por horario de
  // silencio entra SIEMPRE, sin importar su edad — cada corrida vuelve a
  // preguntarle a `isQuietNow` (dentro de `deliverNotification`) si la
  // ventana ya terminó. Lo demás sigue el criterio de siempre: recién
  // pasado el margen de gracia del webhook, y no más viejo que el corte.
  const { data, error } = await client
    .from('notifications')
    .select('id, workspace_id, recipient_id, actor_id, node_id, type, payload')
    .is('pushed_at', null)
    .or(`push_quiet_hold.eq.true,and(created_at.gte.${cutoff},created_at.lte.${graceCutoff})`)
    .order('created_at', { ascending: true })
    .limit(SWEEP_BATCH_SIZE)

  if (error) {
    console.error('push sweep: no se pudo leer el backlog', error.message)
    return
  }

  // Lo más viejo que el corte se archiva sin enviar, para que no quede
  // reintentándose indefinidamente en cada corrida del cron — salvo lo
  // retenido por horario de silencio, que se sigue reintentando cada
  // minuto sin importar su edad hasta que la ventana termine.
  await client
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .is('pushed_at', null)
    .eq('push_quiet_hold', false)
    .lt('created_at', cutoff)

  const pending = (data ?? []) as NotificationRecord[]
  if (pending.length === 0) return

  console.log(`push sweep: ${pending.length} pendiente(s)`)
  // En serie y no con Promise.all: cada notificación abre varias
  // consultas más sus envíos, y el barrido no tiene apuro — es la red de
  // seguridad, no el camino rápido.
  for (const notification of pending) {
    await deliverNotification(env, notification)
  }
}

/** Devuelve la clave pública VAPID al cliente, que la necesita para
 *  suscribirse. Es pública por diseño (viaja en cada mensaje); se sirve
 *  desde acá y no como variable de build para poder rotarla sin
 *  recompilar el front. */
export function handlePushPublicKey(env: Env): Response {
  if (!env.VAPID_PUBLIC_KEY) {
    return Response.json({ error: 'Push no configurado' }, { status: 503 })
  }
  return Response.json(
    { publicKey: env.VAPID_PUBLIC_KEY },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}

// Comparación en tiempo constante. `a === b` corta en el primer byte
// distinto, y esa diferencia de tiempo es medible desde fuera: permite
// adivinar el secreto byte por byte.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
