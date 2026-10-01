import { supabase } from '@/lib/supabase'

// El navegador entrega `applicationServerKey` como Uint8Array, no como el
// base64url que sirve el Worker.
function b64urlToBytes(value: string): Uint8Array {
  const padded = value.length % 4 === 0 ? value : value + '='.repeat(4 - (value.length % 4))
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function bytesToB64url(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch('/api/push/public-key')
  if (!res.ok) throw new Error('Las notificaciones no están configuradas en el servidor.')
  const { publicKey } = (await res.json()) as { publicKey: string }
  return publicKey
}

/** Registro del service worker ya listo. Lo registra
 *  `ServiceWorkerRegister` al arrancar; acá solo se espera. */
async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await registration()
  return reg.pushManager.getSubscription()
}

/**
 * Pide permiso, se suscribe en el push service y guarda el endpoint.
 *
 * `requestPermission()` tiene que salir de un gesto real del usuario o
 * Chrome lo rechaza sin preguntar — por eso esto se llama desde el
 * onClick del botón y nunca al montar un componente.
 */
export async function subscribeToPush(userId: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Bloqueaste las notificaciones para este sitio. Hay que volver a permitirlas desde los ajustes del navegador.'
        : 'No se concedió el permiso de notificaciones.',
    )
  }

  const reg = await registration()
  const applicationServerKey = b64urlToBytes(await fetchVapidPublicKey())

  // Reusar la suscripción existente si ya hay una: volver a llamar a
  // `subscribe()` con otra applicationServerKey lanza InvalidStateError.
  const existing = await reg.pushManager.getSubscription()
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      // Obligatorio en Chrome: una suscripción sin payload cifrado
      // (`userVisibleOnly: false`) no está permitida en la web abierta.
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    }))

  const p256dh = bytesToB64url(subscription.getKey('p256dh'))
  const auth = bytesToB64url(subscription.getKey('auth'))
  if (!p256dh || !auth) throw new Error('El navegador no entregó las claves de cifrado.')

  // Upsert por endpoint: el navegador puede devolver el mismo endpoint
  // tras reinstalar el SW, y `endpoint` es unique en la tabla.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  return subscription
}

/** Desuscribe este dispositivo. Los demás siguen recibiendo. */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription()
  if (!subscription) return

  // Primero la base y después el navegador: si se hiciera al revés y
  // fallara el delete, quedaría una fila apuntando a un endpoint muerto
  // y el Worker mandaría a la nada hasta el primer 410.
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  if (error) throw error

  await subscription.unsubscribe()
}

export async function setPushEnabled(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ push_enabled: enabled }).eq('id', userId)
  if (error) throw error
}
