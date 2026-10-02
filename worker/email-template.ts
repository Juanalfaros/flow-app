import { EmailMessage } from 'cloudflare:email'
import { createMimeMessage } from 'mimetext'
import type { Env } from './index'

// Compartido entre email-dispatch.ts (avisos puntuales) y
// digest-dispatch.ts (resumen semanal) — antes cada uno tenía su propia
// copia literal de la plantilla de marca, las mismas tres constantes y el
// mismo bloque de armado de mimetext. La divergencia entre las dos copias
// ya había tenido una consecuencia real: una escapaba el HTML interpolado
// y la otra no (auditoría de seguridad 2026-09-16, hallazgo S2). Un solo
// lugar para las cuatro cosas cierra esa clase de bug de raíz.

export const FROM_ADDRESS = 'notificaciones@zutra.cl'
export const FROM_NAME = 'Flow'
export const APP_ORIGIN = 'https://flow.zutra.cl'

// Escapa texto Y valores de atributo — la versión que existía antes en
// digest-dispatch.ts solo cubría &/</> (correcto para los dos usos de
// ese archivo, ambos texto visible, nunca un atributo), pero la función
// se lee como "escapa HTML" a secas: en cuanto un caller futuro la usara
// dentro de un `title="…"` o `alt="…"` dejaba de proteger. Completa acá
// con `"`/`'` de una vez.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Esqueleto de marca (artifact "Correos de Flow", 2026-09-11): un solo
// diseño para los dos despachadores, sin franja de color arriba (se
// probó y no gustó — la categoría queda solo en el color del botón).
// HTML de tabla con estilos inline a propósito, no <style> ni CSS
// moderno: Gmail y Outlook desktop no garantizan soportarlo.
// `contentHtml` es SOLO el interior variable de cada correo (párrafo/
// lista + botón) — YA debe venir con cualquier valor interpolado
// escapado por el caller (ver escapeHtml arriba); esta función no vuelve
// a escapar nada, solo arma el marco.
export function renderEmailShell(contentHtml: string, footerLinkLabel: string): string {
  return `
    <div style="background:#EEF2F6;padding:32px 16px;">
      <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;">
        <div style="padding:28px 26px 24px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:15px;font-weight:800;color:#D6004C;margin:0 0 20px;">Flow<span style="color:#F59E0B;">.</span></div>
          ${contentHtml}
        </div>
        <div style="padding:14px 26px;border-top:1px solid #E2E8F0;background:#FAFBFC;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#94A3B8;">
          Flow · <a href="${APP_ORIGIN}/profile" style="color:#D6004C;text-decoration:none;">${footerLinkLabel}</a>
        </div>
      </div>
    </div>
  `
}

/** Botón de acción (mismo estilo en ambos correos) — `label` se escapa acá
 *  porque, a diferencia del resto del contenido, cada caller lo pasa como
 *  texto plano sin escapar de antemano (viene de una constante propia del
 *  archivo o de un título de tarea). */
export function renderEmailButton(label: string, url: string, color: string): string {
  return `<a href="${url}" style="display:inline-block;background:${color};color:#ffffff;font-size:13px;font-weight:700;padding:10px 20px;border-radius:6px;text-decoration:none;">${escapeHtml(label)}</a>`
}

// API "legacy" de EmailMessage (paquete `mimetext`), no el
// `env.EMAIL.send({to, from, subject, html, text})` de objeto plano que
// documenta Cloudflare como la forma nueva: los tipos que genera
// `wrangler types` con la versión de wrangler instalada en este repo
// todavía no traen ese overload (se probó — sigue faltando incluso tras
// actualizar a la última versión disponible). La propia documentación de
// Cloudflare aclara que la API de EmailMessage "sigue soportada", así que
// se usa esa en vez de escribir contra un tipo que hoy no compila acá. Si
// en el futuro `wrangler types` genera el overload de objeto plano, este
// archivo es el único lugar que migrar.
//
// PENDIENTE DE SETUP MANUAL (una sola vez, no se puede vía API con el
// token de este repo — mismo bloqueo que R2, ver wrangler.jsonc): dar de
// alta el dominio "from" en Cloudflare Email Sending. Sin eso,
// env.EMAIL.send() rechaza el envío — capturado abajo, no rompe nada más.
//
// Devuelve true si se entregó (o al menos Cloudflare lo aceptó para
// entrega) — cada caller usa esto para decidir si marca su propio
// "ya se mandó" (notifications.emailed_at / profiles.last_digest_sent_at).
export async function sendBrandedEmail(
  env: Env,
  to: string,
  subject: string,
  textBody: string,
  htmlBody: string,
  logContext: string,
): Promise<boolean> {
  if (!env.EMAIL) return false

  const msg = createMimeMessage()
  msg.setSender({ name: FROM_NAME, addr: FROM_ADDRESS })
  msg.setRecipient(to)
  // `subject` viaja sin filtrar desde el caller (puede incluir un título
  // de tarea) — `mimetext` ya codifica encabezados, así que no se
  // confirmó inyección real, pero recortar CR/LF acá es gratis y cierra
  // el vector por completo en vez de confiar en el encoding de la
  // librería (auditoría 2026-09-16, nota menor de S2).
  msg.setSubject(subject.replace(/[\r\n]+/g, ' '))
  msg.addMessage({ contentType: 'text/plain', data: textBody })
  msg.addMessage({ contentType: 'text/html', data: htmlBody })

  try {
    await env.EMAIL.send(new EmailMessage(FROM_ADDRESS, to, msg.asRaw()))
    return true
  } catch (err) {
    console.error(`${logContext}: send() falló`, err)
    return false
  }
}
