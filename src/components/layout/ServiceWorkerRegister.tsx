import { useEffect } from 'react'
import { getSerwist } from 'virtual:serwist'
import { toast } from 'sonner'

// Chequeo periódico de actualización, además del automático del browser:
// una PWA instalada puede quedar abierta días enteros sin nunca volver a
// pedir `index.html` por su cuenta (a diferencia de una pestaña normal,
// que tiende a recargarse más seguido) — sin esto, el navegador podía
// tardar mucho en notar que había un deploy nuevo esperando.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

export function ServiceWorkerRegister() {
  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    getSerwist().then((serwist) => {
      if (!serwist || cancelled) return

      // `sw.ts` usa skipWaiting+clientsClaim: el service worker nuevo toma
      // el control SIN esperar a que se cierren las pestañas abiertas, así
      // que acá nunca se ve un `waiting` real — la señal correcta es
      // `controlling` con `isUpdate: true` ("un SW nuevo reemplazó a uno
      // que ya estaba activo", a diferencia de la primera instalación de
      // siempre, donde no había ningún controlador previo). Reportado por
      // el usuario: guardaba cambios y la ventana seguía mostrando datos
      // viejos hasta un refresh forzado — la pestaña sigue corriendo el JS
      // viejo en memoria aunque el SW ya cambió de versión por detrás.
      // Un toast persistente en vez de recargar solo, para no cortar una
      // edición en curso a media escritura.
      serwist.addEventListener('controlling', (event) => {
        if (!event.isUpdate) return
        toast('Hay una versión nueva de Flow disponible.', {
          duration: Infinity,
          action: {
            label: 'Recargar',
            onClick: () => window.location.reload(),
          },
        })
      })

      void serwist.register()

      const checkForUpdate = () => void serwist.update()
      const onVisible = () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      }
      document.addEventListener('visibilitychange', onVisible)
      window.addEventListener('online', checkForUpdate)
      const intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS)

      cleanup = () => {
        document.removeEventListener('visibilitychange', onVisible)
        window.removeEventListener('online', checkForUpdate)
        window.clearInterval(intervalId)
      }
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  return null
}
