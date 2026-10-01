// Vector de prueba del apéndice de RFC 8291 (§5, "Push Message
// Encryption Example"). Se corre con `pnpm test:push` (node, sin
// framework — es una sola aserción y no justifica traer vitest).
//
// Por qué existe: un error en el cifrado de Web Push NO se manifiesta
// como error. El push service responde 201 Created igual, y el navegador
// del destinatario descarta el mensaje sin mostrar nada ni reportar
// nada. Sin este test, la única forma de saber que el cifrado está bien
// es probar en un teléfono real y ver si llega — y si no llega, no hay
// dónde mirar. Con el vector fijado, un cambio que rompa el orden de las
// claves o el padding falla acá, en un segundo.

import { encryptPayload, b64urlToBytes, bytesToB64url, vapidAuthorization } from './push.ts'

const VECTOR = {
  plaintext: 'When I grow up, I want to be a watermelon',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  expectedBody:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

let failures = 0

function check(name: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log(`  ok   ${name}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${name}`)
  console.error(`       esperado: ${expected}`)
  console.error(`       obtenido: ${actual}`)
}

async function run() {
  console.log('RFC 8291 §5 — cifrado del payload')
  const { body } = await encryptPayload(
    new TextEncoder().encode(VECTOR.plaintext),
    VECTOR.uaPublic,
    VECTOR.authSecret,
    {
      salt: b64urlToBytes(VECTOR.salt),
      asPublic: b64urlToBytes(VECTOR.asPublic),
      asPrivateD: VECTOR.asPrivate,
    },
  )
  check('cuerpo cifrado completo', bytesToB64url(body), VECTOR.expectedBody)

  // El VAPID no tiene vector fijo (la firma ECDSA lleva un nonce
  // aleatorio, así que cambia en cada corrida). Se verifica la forma:
  // esquema correcto, `aud` = origen y no endpoint completo, y una firma
  // de 64 bytes crudos (r||s), que es donde se equivoca quien porta el
  // código desde Node y deja la firma en DER.
  console.log('RFC 8292 — cabecera VAPID')
  const keys = {
    publicKey: VECTOR.asPublic,
    privateKey: VECTOR.asPrivate,
    subject: 'mailto:flow@zutra.cl',
  }
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc123?x=1', keys)

  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header)
  if (!match) {
    failures += 1
    console.error(`  FAIL forma de la cabecera\n       obtenido: ${header}`)
  } else {
    const [, rawHeader, rawPayload, rawSignature, rawKey] = match
    const decoded = (v: string) => new TextDecoder().decode(b64urlToBytes(v))
    check('alg del JWT', JSON.parse(decoded(rawHeader!)).alg, 'ES256')
    check('aud = origen del endpoint', JSON.parse(decoded(rawPayload!)).aud, 'https://fcm.googleapis.com')
    check('sub', JSON.parse(decoded(rawPayload!)).sub, 'mailto:flow@zutra.cl')
    check('firma cruda r||s de 64 bytes', String(b64urlToBytes(rawSignature!).length), '64')
    check('k = clave pública VAPID', rawKey!, VECTOR.asPublic)
  }

  // El vector del RFC fija sal y clave efímera vía `overrides`, así que
  // NO ejercita el camino que corre en producción: sal aleatoria y par
  // efímero recién generado. Este round-trip sí — cifra como el Worker y
  // descifra como lo haría el navegador, que es la única forma de
  // comprobar sin un teléfono que el mensaje es legible del otro lado.
  console.log('Round-trip con claves generadas (camino de producción)')
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))
  const uaAuth = crypto.getRandomValues(new Uint8Array(16))
  const message = 'Tarea nueva: revisar el informe · acentos y ñ'

  const { body: sealed } = await encryptPayload(
    new TextEncoder().encode(message),
    bytesToB64url(uaPublicRaw),
    bytesToB64url(uaAuth),
  )

  // Lado receptor: deshace la cabecera de RFC 8188 y repite la
  // derivación de RFC 8291 desde la clave privada del "navegador".
  const salt = sealed.slice(0, 16)
  const idlen = sealed[20]!
  const asPublicRaw = sealed.slice(21, 21 + idlen)
  const ciphertext = sealed.slice(21 + idlen)

  const asPublicKey = await crypto.subtle.importKey(
    'raw',
    asPublicRaw as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asPublicKey }, ua.privateKey, 256),
  )

  const enc = new TextEncoder()
  const join = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let at = 0
    for (const part of parts) {
      out.set(part, at)
      at += part.length
    }
    return out
  }
  // Los `as BufferSource` son por la variante `ArrayBufferLike` de
  // `Uint8Array` en TS 6: WebCrypto pide `ArrayBuffer` y no acepta la
  // posibilidad de `SharedArrayBuffer`. Mismo tratamiento que en push.ts.
  const mac = async (key: Uint8Array, data: Uint8Array) => {
    const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ])
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource))
  }
  const derive = async (sl: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) =>
    (await mac(await mac(sl, ikm), join(info, Uint8Array.of(1)))).slice(0, len)

  const ikm = await derive(
    uaAuth,
    shared,
    join(enc.encode('WebPush: info'), Uint8Array.of(0), uaPublicRaw, asPublicRaw),
    32,
  )
  const cek = await derive(salt, ikm, join(enc.encode('Content-Encoding: aes128gcm'), Uint8Array.of(0)), 16)
  const nonce = await derive(salt, ikm, join(enc.encode('Content-Encoding: nonce'), Uint8Array.of(0)), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, { name: 'AES-GCM' }, false, ['decrypt'])
  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      ciphertext as BufferSource,
    ),
  )
  // El último byte es el delimitador de padding 0x02 (RFC 8188 §2).
  check('padding delimiter', String(decrypted[decrypted.length - 1]), '2')
  check('texto recuperado', new TextDecoder().decode(decrypted.slice(0, -1)), message)
  check('longitud de la sal', String(salt.length), '16')
  check('keyid = clave efímera de 65 bytes', String(idlen), '65')

  // `throw` y no `process.exit`: el tsconfig del Worker corre con
  // `types: []`, así que `process` no existe para el type checker. Una
  // promesa rechazada ya devuelve exit code 1 en Node.
  if (failures > 0) throw new Error(`${failures} verificación(es) fallaron`)
  console.log('\nTodo en orden.')
}

void run()
