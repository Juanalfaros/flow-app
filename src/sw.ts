import { defaultCache } from '@serwist/vite/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { ExpirationPlugin, NetworkFirst, Serwist } from 'serwist'
import { storePendingShare } from './lib/share-target'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[]
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Datos de Supabase (PostgREST): NetworkFirst, cae a la última respuesta
    // cacheada si no hay red. Solo lecturas — el matcher de Route ya filtra
    // por método GET por default, y las mutaciones (POST/PATCH/DELETE) las
    // maneja la cola offline de IndexedDB (src/lib/offline-queue.ts), no el SW.
    {
      matcher: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/'),
      handler: new NetworkFirst({
        cacheName: 'supabase-data',
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/index.html',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()

// ---------------------------------------------------------------------
// Web Push (0050_push_subscriptions.sql, worker/push-dispatch.ts)
//
// Serwist NO registra estos dos handlers: `addEventListeners()` cubre
// install/activate/fetch/message y nada más. Van acá abajo, después, para
// no depender del orden interno de Serwist.
// ---------------------------------------------------------------------

interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
}

self.addEventListener('push', (event) => {
  // Un push sin payload legible igual tiene que mostrar ALGO: en Chrome,
  // un evento `push` que termina sin llamar a `showNotification` hace que
  // el navegador muestre su propia notificación genérica ("Este sitio se
  // actualizó en segundo plano") y, si se repite, revoque el permiso.
  let payload: PushPayload = {
    title: 'Flow',
    body: 'Tienes una notificación nueva',
    url: '/bandeja',
    tag: 'flow',
  }
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as Partial<PushPayload>) }
  } catch {
    // Payload no-JSON: se muestra el genérico de arriba.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Agrupa por tarea: varios cambios seguidos reemplazan el aviso
      // anterior en vez de apilarse (lo decide el Worker, ver `tag` en
      // buildPayload).
      tag: payload.tag,
      data: { url: payload.url },
      // `renotify` está en la spec de Notifications y lo implementan
      // Chrome y Android, pero todavía no figura en el
      // `NotificationOptions` de lib.webworker. Sin él, una notificación
      // que reemplaza a otra del mismo `tag` se actualiza en silencio y
      // nadie se entera del segundo cambio.
      renotify: true,
    } as NotificationOptions & { renotify: boolean }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawUrl = (event.notification.data as { url?: string } | undefined)?.url
  // Defensa en profundidad (auditoría de seguridad 2026-09-16, S8): hoy
  // `rawUrl` no es alcanzable por nadie externo (el payload va cifrado
  // con las claves de la propia suscripción, RFC 8291, y lo arma
  // `buildPayload` a partir de uuids de la base), pero el sink es
  // potente — `openWindow`/`navigate` con una URL absoluta abre
  // cualquier origen desde un clic en una notificación con la marca de
  // la app. Exigir una ruta relativa (empieza con `/`, no con `//` —
  // eso sería protocol-relative a otro host) cierra el vector aunque el
  // cifrado algún día deje de ser la única barrera.
  const target = rawUrl && rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/bandeja'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Reusar una ventana ya abierta en vez de abrir otra: en Android,
      // `openWindow` con la PWA instalada y viva termina en dos
      // instancias de la app compitiendo por el mismo canal de Realtime.
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          // `navigate` puede fallar si el cliente no está controlado por
          // este SW (pestaña abierta antes de la instalación). Ahí se
          // cae a `openWindow`.
          try {
            await client.navigate(target)
            return
          } catch {
            break
          }
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

// ---------------------------------------------------------------------
// Share Target (Android): "Compartir" desde otra app hacia flow.
//
// El `action` del manifest (`/compartir`, POST, multipart/form-data) NO es
// una ruta de la SPA que reciba ese POST — Android se lo entrega directo a
// ESTE fetch handler, antes de que exista ninguna pestaña. La única forma
// de pasarle esos bytes (archivos incluidos) a /compartir es guardarlos y
// redirigir a esa misma URL en GET, que ahí sí abre/enfoca la app — ver
// src/lib/share-target.ts, el otro lado de este puente.
//
// Listener aparte del que arma Serwist (serwist.addEventListeners()):
// conviven porque Serwist solo hace respondWith() sobre lo que matchea sus
// propias rutas (GET, en la práctica), y acá se sale al toque si no es
// este POST puntual — nunca compite por la misma request.
// ---------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/compartir') return

  event.respondWith(
    (async () => {
      try {
        const formData = await event.request.formData()
        const files = formData.getAll('photos').filter((f): f is File => f instanceof File)
        await storePendingShare({
          title: String(formData.get('title') ?? ''),
          text: String(formData.get('text') ?? ''),
          url: String(formData.get('url') ?? ''),
          files,
          created_at: Date.now(),
        })
      } catch (err) {
        console.error('share target: no se pudo guardar lo compartido', err)
      }
      // 303: el POST original se reemplaza por un GET a la misma URL —
      // /compartir (la ruta de la SPA) lee lo recién guardado al montar.
      return Response.redirect('/compartir', 303)
    })(),
  )
})
