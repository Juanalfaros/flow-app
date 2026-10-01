// Genera el par de claves VAPID para Web Push (RFC 8292).
//
//   pnpm vapid
//
// Se corre UNA sola vez, en la máquina de quien administra el proyecto, y
// nunca en CI ni en una sesión compartida: la clave privada que imprime es
// la identidad del servidor ante Google, Apple y Mozilla.
//
// El par es ESTABLE de por vida. Rotarlo invalida todas las suscripciones
// existentes: cada persona del equipo tendría que volver a conceder el
// permiso desde su perfil, sin ningún aviso previo. Si se pierde la clave
// privada no hay recuperación posible — hay que generar otra y asumir esa
// reconexión masiva.
//
// La clave pública NO es secreta: viaja dentro de cada mensaje y el Worker
// la sirve en /api/push/public-key.

import { webcrypto as crypto } from 'node:crypto'

function toB64url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])

// Formato crudo del punto sin comprimir (0x04 || x || y), 65 bytes: es lo
// que espera `applicationServerKey` en el navegador y `k=` en la cabecera
// VAPID.
const publicKey = toB64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
// El escalar privado sale del JWK, ya en base64url.
const { d: privateKey } = await crypto.subtle.exportKey('jwk', pair.privateKey)

console.log(`
Par VAPID generado. Guárdalo como secrets del Worker:

  pnpm exec wrangler secret put VAPID_PUBLIC_KEY
  ${publicKey}

  pnpm exec wrangler secret put VAPID_PRIVATE_KEY
  ${privateKey}

  pnpm exec wrangler secret put VAPID_SUBJECT
  mailto:tu-correo@zutra.cl

Falta uno más, que no sale de acá — un secreto cualquiera que compartes
con el Database Webhook de Supabase (ver README, "Notificaciones push"):

  pnpm exec wrangler secret put PUSH_WEBHOOK_SECRET
  ${toB64url(crypto.getRandomValues(new Uint8Array(32)))}

No guardes la clave privada en el repo ni en wrangler.jsonc.
`)
