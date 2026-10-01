import { handleInvite } from './invite'
import { handleDeleteAccount } from './account'
import { handleAccountExport } from './account-export'
import { handleCalendarFeed } from './calendar'
import { handlePublicLink } from './public-link'
import { handleAttachmentUpload, handleAttachmentDownload, handleAttachmentDelete } from './attachments'
import { handlePushDispatch, handlePushPublicKey, sweepPendingPushes } from './push-dispatch'
import {
  handleGoogleStart,
  handleGoogleCallback,
  handleGoogleEvents,
  handleGoogleDisconnect,
} from './google'
import { sweepDueReminders } from './automation-dispatch'
import { sendWeeklyDigests } from './digest-dispatch'

// Deben coincidir literalmente con lo declarado en wrangler.jsonc: el
// runtime pasa la expresión cron tal cual está escrita ahí.
const KEEPALIVE_CRON = '0 6 */3 * *'
// Antes corría una vez al día (`0 13 * * *`, de ahí el nombre histórico);
// pasó a cada hora en el rediseño de Ajustes PR 3 (2026-09-25) para que
// "Día y hora del resumen" (profiles.digest_day/digest_hour,
// 0092_notification_preferences.sql) se pueda respetar de verdad — con un
// solo disparo diario a hora fija, la hora elegida por cada persona casi
// nunca calzaba. sweepDueReminders ya era idempotente, así que llamarla
// 24x más seguido es seguro.
const HOURLY_CRON = '0 * * * *'

export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  ASSETS: Fetcher
  // Adjuntos de tareas (0038_task_attachments.sql). Requiere el bucket R2
  // creado a mano — ver la nota en wrangler.jsonc.
  ATTACHMENTS: R2Bucket
  // Google Calendar (0040_google_credentials.sql). Los tres son secrets del
  // Worker (`wrangler secret put`), nunca variables en wrangler.jsonc.
  // `GOOGLE_TOKEN_KEY` es base64 de 32 bytes aleatorios y es la clave que
  // cifra los refresh tokens: si se pierde, todos deben reconectar; si se
  // filtra junto con un dump de la base, se exponen los calendarios.
  // Si faltan, la integración se reporta como no configurada en vez de
  // romper el resto del Worker.
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_TOKEN_KEY: string
  // Web Push (0050_push_subscriptions.sql). Los cuatro son secrets del
  // Worker. El par VAPID identifica a este servidor ante los push
  // services (Google/Apple/Mozilla) y es ESTABLE: rotarlo invalida todas
  // las suscripciones existentes y obliga a que cada persona vuelva a
  // conceder el permiso. `VAPID_SUBJECT` es un mailto: de contacto que
  // exige la spec. `PUSH_WEBHOOK_SECRET` autentica al Database Webhook
  // de Supabase, que no tiene JWT que presentar.
  // Si faltan, el envío se salta con un log y el resto del Worker sigue
  // funcionando — mismo criterio que la integración de Google.
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  PUSH_WEBHOOK_SECRET: string
  // Fallback de email cuando no hay push suscrito (F5 #10, ver
  // worker/email-dispatch.ts). Binding, no secret — requiere el dominio
  // "from" dado de alta en Cloudflare Email Sending (setup manual
  // pendiente, ver la nota en wrangler.jsonc); sin eso el envío falla
  // pero el resto del Worker sigue funcionando, mismo criterio que Push
  // sin VAPID.
  EMAIL: SendEmail
}

export default {
  // Con `main` presente, las requests que no matchean un archivo estático
  // literal se enrutan siempre al fetch() del User Worker (nunca aplican
  // `not_found_handling` por sí solas). `/api/*` se maneja acá; todo lo
  // demás se delega al Asset Worker vía el binding `ASSETS`, que sí
  // respeta `not_found_handling: single-page-application` para las
  // rutas del cliente (TanStack Router).
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/invite' && request.method === 'POST') {
      return handleInvite(request, env)
    }

    if (url.pathname === '/api/account' && request.method === 'DELETE') {
      return handleDeleteAccount(request, env)
    }

    if (url.pathname === '/api/account/export' && request.method === 'GET') {
      return handleAccountExport(request, env)
    }

    // Feed iCal: `/api/calendar/<token>.ics`. El token va en el path y no en
    // un query param porque Google Calendar exige una URL que termine en .ics
    // para reconocerla como calendario al suscribirse.
    const calendarMatch = /^\/api\/calendar\/([a-f0-9]{64})\.ics$/.exec(url.pathname)
    if (calendarMatch?.[1] && (request.method === 'GET' || request.method === 'HEAD')) {
      return handleCalendarFeed(request, env, calendarMatch[1])
    }

    // Link público de solo lectura (0085_public_links.sql): mismo
    // criterio que el feed de calendario, token en el path, sin JWT.
    const publicLinkMatch = /^\/api\/public-link\/([a-f0-9]{64})$/.exec(url.pathname)
    if (publicLinkMatch?.[1] && request.method === 'GET') {
      return handlePublicLink(request, env, publicLinkMatch[1])
    }

    // Web Push. `/dispatch` lo llama Postgres (Database Webhook) con un
    // secreto compartido, no una persona con JWT; `/public-key` es
    // deliberadamente anónimo — la clave pública VAPID viaja en cada
    // mensaje, no es un secreto.
    if (url.pathname === '/api/push/dispatch' && request.method === 'POST') {
      return handlePushDispatch(request, env, ctx)
    }
    if (url.pathname === '/api/push/public-key' && request.method === 'GET') {
      return handlePushPublicKey(env)
    }

    if (url.pathname === '/api/attachments') {
      if (request.method === 'POST') return handleAttachmentUpload(request, env)
      if (request.method === 'GET') return handleAttachmentDownload(request, env)
      if (request.method === 'DELETE') return handleAttachmentDelete(request, env)
    }

    // Google Calendar. `/callback` es GET porque lo invoca el navegador al
    // volver de Google; los otros tres exigen el JWT en la cabecera.
    if (url.pathname === '/api/google/start' && request.method === 'POST') {
      return handleGoogleStart(request, env)
    }
    if (url.pathname === '/api/google/callback' && request.method === 'GET') {
      return handleGoogleCallback(request, env)
    }
    if (url.pathname === '/api/google/events' && request.method === 'GET') {
      return handleGoogleEvents(request, env, ctx)
    }
    if (url.pathname === '/api/google/disconnect' && request.method === 'POST') {
      return handleGoogleDisconnect(request, env)
    }

    // Cualquier otra cosa bajo /api/ es 404, no el shell de la SPA.
    //
    // Sin este corte, `not_found_handling: single-page-application` devuelve
    // index.html con status 200 para rutas de API inexistentes. Eso ya causó un
    // bug real: `inviteMember` hacía `await res.json()` sobre esa respuesta y
    // fallaba con "Unexpected end of JSON input", escondiendo la causa. Un
    // cliente de calendario suscrito a una URL mal escrita tendría el mismo
    // problema — recibiría HTML donde espera un .ics.
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    return env.ASSETS.fetch(request)
  },

  // Tres crons con propósitos distintos, discriminados por `event.cron`
  // (wrangler.jsonc los declara en ese mismo formato). Sin el switch,
  // el barrido de push correría cada 3 días y el keep-alive cada minuto.
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === KEEPALIVE_CRON) {
      // Los proyectos Supabase free tier se auto-pausan tras ~7 días sin
      // actividad de API. Este cron (cada 3 días) hace una lectura barata
      // para resetear el contador de inactividad.
      ctx.waitUntil(
        fetch(`${env.SUPABASE_URL}/rest/v1/workspaces?select=id&limit=1`, {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          },
        }).then((res) => {
          if (!res.ok) console.error(`keep-alive ping failed: ${res.status}`)
        }),
      )
      return
    }

    if (event.cron === HOURLY_CRON) {
      // Recordatorio de vencimiento de Automatizaciones (0063, ver
      // worker/automation-dispatch.ts) — este repo no tiene pg_cron.
      //
      // Resumen semanal por correo (Fase 4, worker/digest-dispatch.ts):
      // mismo disparo por hora, sin cron propio — filtra adentro por
      // día+hora LOCAL de cada persona, igual que sweepDueReminders
      // filtra adentro por due_date = ayer. Las dos corren en paralelo:
      // no comparten ninguna fila (una toca `nodes.due_reminder_sent_at`,
      // la otra `profiles.last_digest_sent_at`).
      ctx.waitUntil(Promise.all([sweepDueReminders(env), sendWeeklyDigests(env)]))
      return
    }

    // Red de seguridad del Web Push: entrega lo que el Database Webhook
    // no logró (ver worker/push-dispatch.ts). En régimen normal no
    // encuentra nada y termina en una sola consulta.
    ctx.waitUntil(sweepPendingPushes(env))
  },
} satisfies ExportedHandler<Env>
