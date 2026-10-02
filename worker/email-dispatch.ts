import { adminClient, buildPayload, type NotificationRecord } from './notification-payload'
import { APP_ORIGIN, escapeHtml, renderEmailButton, renderEmailShell, sendBrandedEmail } from './email-template'
import type { Env } from './index'

// F5 #10 — la de menor prioridad de todo el plan F5: fallback de email
// cuando la persona no tiene NINGÚN dispositivo con Web Push activo (ver
// el branch `targets.length === 0` en push-dispatch.ts). Con Web Push ya
// funcionando (0050), el aviso del sistema llega antes y se lee más que
// un correo para un equipo interno con la PWA instalada — esto es
// respaldo, no el camino principal.

// `removed_from_workspace` no tiene botón: no hay ningún lugar al que
// este correo pueda llevar, la persona ya perdió el acceso.
const BUTTON_BY_TYPE: Record<string, { label: string; color: string } | null> = {
  due_reminder: { label: 'Completar o reprogramar', color: '#E11D48' },
  removed_from_workspace: null,
  role_changed: { label: 'Abrir Flow', color: '#FF0055' },
  welcome: { label: 'Entrar a Flow', color: '#FF0055' },
}
const DEFAULT_BUTTON = { label: 'Ver en Flow', color: '#FF0055' }

// `body` interpola `describe()` (notification-payload.ts), que a su vez
// interpola valores que controla cualquier miembro del workspace —
// `profiles.full_name` (actorName), `statuses.name`, títulos de tarea.
// Sin escapar acá, alguien podía poner como nombre completo un `<a
// href="https://phishing…">…</a>` y disparar cualquier notificación hacia
// la víctima: el correo sale firmado con el DKIM real del dominio, así
// que pasa cualquier filtro de spam y se ve idéntico a uno legítimo
// (auditoría de seguridad 2026-09-16, hallazgo S2 — digest-dispatch.ts
// ya escapaba su propio contenido interpolado, este archivo no).
function renderEmailHtml(body: string, url: string, type: string): string {
  const button = type in BUTTON_BY_TYPE ? BUTTON_BY_TYPE[type] : DEFAULT_BUTTON
  const buttonHtml = button ? renderEmailButton(button.label, url, button.color) : ''
  const content = `
    <p style="font-size:14px;line-height:1.55;color:#0F172A;margin:0 0 18px;">${escapeHtml(body)}</p>
    ${buttonHtml}
  `
  return renderEmailShell(content, 'Preferencias de notificación')
}

export async function sendNotificationEmail(env: Env, notification: NotificationRecord): Promise<boolean> {
  if (!env.EMAIL) return false

  const client = adminClient(env)

  // `profiles` no guarda email (vive en auth.users, que administra
  // Supabase Auth) — mismo camino que ya usa worker/invite.ts para
  // mandar la invitación inicial, acá en la dirección inversa
  // (id -> email en vez de email -> invitación).
  const { data: userRes, error: userError } = await client.auth.admin.getUserById(notification.recipient_id)
  const email = userRes?.user?.email
  if (userError || !email) {
    console.error('email fallback: sin email para', notification.recipient_id, userError?.message)
    return false
  }

  const payload = await buildPayload(client, notification)
  const url = `${APP_ORIGIN}${payload.url}`
  const button = notification.type in BUTTON_BY_TYPE ? BUTTON_BY_TYPE[notification.type] : DEFAULT_BUTTON

  const textBody = button ? `${payload.body}\n\n${button.label}: ${url}` : payload.body
  const htmlBody = renderEmailHtml(payload.body, url, notification.type)

  return sendBrandedEmail(env, email, payload.title, textBody, htmlBody, 'email fallback')
}
