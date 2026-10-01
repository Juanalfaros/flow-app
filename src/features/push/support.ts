// Qué puede y qué no puede hacer ESTE dispositivo con Web Push.
//
// Lo que hace especial a iOS: Safari soporta Web Push desde 16.4, pero
// SOLO cuando la web está instalada en la pantalla de inicio. En una
// pestaña normal de Safari, `Notification` y `PushManager` directamente
// no existen en `window` — no es que el permiso se deniegue, es que la
// API no está. Eso significa que la detección ingenua ("¿existe
// PushManager? entonces no se puede") le dice a un iPhone que su
// dispositivo no sirve, cuando lo único que hace falta es instalar la
// app. De ahí que esto devuelva un motivo y no un booleano.

export type PushSupport =
  | { kind: 'supported' }
  /** iOS/iPadOS en pestaña: se arregla instalando la PWA. */
  | { kind: 'needs-install' }
  /** Navegador sin Web Push (Safari de escritorio viejo, navegadores en iOS antes de 16.4). */
  | { kind: 'unsupported' }

export function isStandalone(): boolean {
  // `navigator.standalone` es la variante de iOS (no estándar y no
  // tipada); `display-mode: standalone` cubre Android y escritorio.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  // El iPad moderno se identifica como Macintosh; `maxTouchPoints > 1`
  // lo distingue de un Mac de verdad.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function detectPushSupport(): PushSupport {
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApi) return { kind: 'supported' }
  // En iOS la API aparece recién al abrir la app instalada, así que la
  // ausencia se interpreta como "falta instalar" y no como "no se puede".
  if (isIos() && !isStandalone()) return { kind: 'needs-install' }
  return { kind: 'unsupported' }
}
