// Web Push desde el Worker, sin dependencias: `web-push` (el paquete de
// npm) es Node-only y arrastra `crypto` nativo, así que acá se implementa
// a mano sobre WebCrypto, que Workers sí expone completo (ECDH deriveBits,
// ECDSA P-256 y AES-GCM).
//
// Dos especificaciones distintas y ortogonales, fácil de confundirlas:
//
//   RFC 8291 — cifra el PAYLOAD para que el push service (Google, Apple,
//   Mozilla) reenvíe bytes que no puede leer. Content-Encoding: aes128gcm.
//   Las claves salen de un ECDH efímero contra la `p256dh` del navegador.
//
//   RFC 8292 (VAPID) — identifica al REMITENTE ante el push service con un
//   JWT ES256 firmado con una clave estable del servidor. No tiene nada que
//   ver con el cifrado del payload; son dos pares de claves diferentes.
//
// El vector de prueba del apéndice de RFC 8291 se corre en
// `worker/push.test.ts` — si algo de acá se toca, ese test es la red de
// seguridad, porque un error de cifrado no se ve como error: el push
// service devuelve 201 igual y el navegador descarta el mensaje en
// silencio.

const UTF8 = new TextEncoder()

export function b64urlToBytes(value: string): Uint8Array {
  const padded = value.length % 4 === 0 ? value : value + '='.repeat(4 - (value.length % 4))
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data as BufferSource))
}

// HKDF de una sola ronda (RFC 5869 con L <= 32): extract + un bloque de
// expand. Todos los usos de Web Push piden 12 o 16 bytes, así que no hace
// falta el bucle de bloques.
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm)
  const okm = await hmacSha256(prk, concat(info, Uint8Array.of(1)))
  return okm.slice(0, length)
}

// Una clave P-256 cruda (los 32 bytes del escalar privado) no se puede
// importar directo: WebCrypto exige JWK, y el JWK exige también las
// coordenadas públicas. Se derivan partiendo el punto sin comprimir
// (0x04 || x(32) || y(32)).
function ecJwk(privateD: string, publicKey: Uint8Array): JsonWebKey {
  return {
    kty: 'EC',
    crv: 'P-256',
    d: privateD,
    x: bytesToB64url(publicKey.slice(1, 33)),
    y: bytesToB64url(publicKey.slice(33, 65)),
    ext: true,
  }
}

export interface EncryptedPush {
  body: Uint8Array
}

/**
 * Cifra `plaintext` para una suscripción concreta (RFC 8291 §3-4).
 *
 * `overrides` existe solo para el test del vector del RFC, que necesita
 * fijar la sal y el par efímero; en producción ambos son aleatorios por
 * mensaje y NUNCA deben reusarse: repetir sal + clave con la misma CEK
 * rompe AES-GCM.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: string,
  authSecret: string,
  overrides?: { salt: Uint8Array; asPublic: Uint8Array; asPrivateD: string },
): Promise<EncryptedPush> {
  const uaPublicBytes = b64urlToBytes(p256dh)
  const authBytes = b64urlToBytes(authSecret)

  let asPublicBytes: Uint8Array
  let asPrivateKey: CryptoKey
  if (overrides) {
    asPublicBytes = overrides.asPublic
    asPrivateKey = await crypto.subtle.importKey(
      'jwk',
      ecJwk(overrides.asPrivateD, overrides.asPublic),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    )
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair
    asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    asPrivateKey = pair.privateKey
  }
  const salt = overrides?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asPrivateKey, 256),
  )

  // El orden de las claves públicas en `key_info` es ua || as y no al
  // revés (RFC 8291 §3.4). Invertirlo produce un mensaje que el push
  // service acepta y el navegador descarta sin decir nada.
  const keyInfo = concat(UTF8.encode('WebPush: info'), Uint8Array.of(0), uaPublicBytes, asPublicBytes)
  const ikm = await hkdf(authBytes, ecdhSecret, keyInfo, 32)

  const cek = await hkdf(salt, ikm, concat(UTF8.encode('Content-Encoding: aes128gcm'), Uint8Array.of(0)), 16)
  const nonce = await hkdf(salt, ikm, concat(UTF8.encode('Content-Encoding: nonce'), Uint8Array.of(0)), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, { name: 'AES-GCM' }, false, ['encrypt'])
  // 0x02 es el delimitador de "último registro" del esquema de padding de
  // aes128gcm (RFC 8188 §2). Sin él, Chrome rechaza el mensaje.
  const padded = concat(plaintext, Uint8Array.of(2))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 }, aesKey, padded as BufferSource),
  )

  // Cabecera de RFC 8188: salt(16) || record_size(4, big endian) ||
  // idlen(1) || keyid(idlen). Acá el keyid es la clave pública efímera.
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096, false)

  return { body: concat(salt, recordSize, Uint8Array.of(asPublicBytes.length), asPublicBytes, ciphertext) }
}

export interface VapidKeys {
  publicKey: string
  privateKey: string
  subject: string
}

/**
 * Cabecera `Authorization` de VAPID (RFC 8292 §3), esquema `vapid`.
 *
 * El `aud` es el ORIGEN del endpoint, no el endpoint completo: mandar la
 * URL entera hace que FCM devuelva 401.
 */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys): Promise<string> {
  const audience = new URL(endpoint).origin
  const header = bytesToB64url(UTF8.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64url(
    UTF8.encode(
      JSON.stringify({
        aud: audience,
        // 12 h: por debajo del máximo de 24 h que exige la spec, y con
        // margen de sobra para el reloj del push service.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      }),
    ),
  )
  const signingInput = `${header}.${payload}`

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    ecJwk(keys.privateKey, b64urlToBytes(keys.publicKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // WebCrypto firma ECDSA en formato crudo r||s, que es justo lo que pide
  // JWS. `web-push` en Node tiene que convertir desde DER; acá no.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, UTF8.encode(signingInput)),
  )

  return `vapid t=${signingInput}.${bytesToB64url(signature)}, k=${keys.publicKey}`
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushResult {
  ok: boolean
  status: number
  /** 404/410: la suscripción ya no existe y hay que borrarla de la base. */
  expired: boolean
}

/**
 * Entrega un mensaje a un endpoint de push.
 *
 * No lanza: un equipo con varios dispositivos tiene suscripciones muertas
 * (navegador desinstalado, permiso revocado) y una de ellas no debe
 * abortar el envío al resto. El caller decide qué hacer con `expired`.
 */
export async function sendPush(
  target: PushTarget,
  payload: string,
  keys: VapidKeys,
  opts: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {},
): Promise<PushResult> {
  try {
    const { body } = await encryptPayload(UTF8.encode(payload), target.p256dh, target.auth)
    const authorization = await vapidAuthorization(target.endpoint, keys)

    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        // TTL por defecto de 24 h: si el teléfono está apagado, el push
        // service guarda el mensaje en vez de descartarlo.
        TTL: String(opts.ttlSeconds ?? 24 * 60 * 60),
        Urgency: opts.urgency ?? 'normal',
      },
      body: body as BufferSource,
    })

    return { ok: res.ok, status: res.status, expired: res.status === 404 || res.status === 410 }
  } catch (err) {
    console.error('sendPush failed', target.endpoint, err)
    return { ok: false, status: 0, expired: false }
  }
}
