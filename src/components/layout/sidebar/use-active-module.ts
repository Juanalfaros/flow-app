import { useEffect, useRef } from 'react'
import { useMatchRoute, useParams } from '@tanstack/react-router'
import type { ModuleId } from '@/components/layout/sidebar/modules'
import { useSelectedModule, setSelectedModule } from '@/lib/sidebar-state'

// Mismas banderas que ya calculaba Sidebar.tsx antes del rediseño
// (isHome/isBandeja/isMyTasks/...) — acá se resuelven a UN módulo en vez de
// a "está activo este ítem sí/no" fila por fila. `activeProjectId`/
// `activeFolderId` (viendo cualquier proyecto o carpeta) siempre es
// "Espacios", igual que antes.
function useRouteModule(): ModuleId {
  const matchRoute = useMatchRoute()
  const { projectId: activeProjectId, folderId: activeFolderId } = useParams({ strict: false })

  if (activeProjectId || activeFolderId) return 'espacios'
  if (matchRoute({ to: '/' })) return 'inicio'
  if (matchRoute({ to: '/bandeja' })) return 'bandeja'
  if (matchRoute({ to: '/mis-tareas' })) return 'tareas'
  if (matchRoute({ to: '/equipo', fuzzy: true })) return 'equipo'
  if (
    matchRoute({ to: '/calendario' }) ||
    matchRoute({ to: '/timeline' }) ||
    matchRoute({ to: '/tabla' }) ||
    matchRoute({ to: '/reportes' })
  ) {
    return 'vistas'
  }
  if (
    matchRoute({ to: '/profile' }) ||
    matchRoute({ to: '/plantillas' }) ||
    matchRoute({ to: '/archivados' }) ||
    matchRoute({ to: '/campos-personalizados' })
  ) {
    return 'ajustes'
  }
  // Ninguna ruta de _app debería caer acá, pero un fallback explícito es
  // mejor que un `| null` que cada consumidor tendría que manejar aparte
  // — mismo default ('espacios') que usa el propio artifact del mockup.
  return 'espacios'
}

/**
 * Módulo cuyo panel se muestra — por defecto el que corresponde a la ruta
 * actual (entrar directo a una tarea de un espacio abre el panel de
 * Espacios con esa rama expandida, igual que el <nav> de antes mostraba
 * todo junto). Clickear un ícono del riel para un módulo SIN una página
 * "hogar" propia (Espacios, Vistas globales, Equipo, Ajustes) cambia el
 * panel visible sin navegar — para eso existe `selectModule`, que pisa la
 * ruta hasta la próxima navegación real. Cualquier cambio de ruta
 * (clickear un link real, ir atrás/adelante) vuelve a dejar que la ruta
 * mande, así que un módulo "espiado" a mano nunca queda pegado para
 * siempre en una pestaña vieja.
 *
 * Esa elección manual se guarda (sidebar-state.ts) en vez de vivir en un
 * useState: recargar estando en Inicio con el panel de Espacios abierto te
 * devolvía a Inicio, perdiendo justo lo que estabas mirando. Recargar no es
 * un cambio de ruta, así que la elección sobrevive; navegar sí lo es, y ahí
 * se limpia como siempre.
 */
export function useActiveModule(): { activeModule: ModuleId; selectModule: (id: ModuleId) => void } {
  const routeModule = useRouteModule()
  const manual = useSelectedModule()
  const prevRouteModule = useRef(routeModule)

  useEffect(() => {
    if (prevRouteModule.current !== routeModule) {
      prevRouteModule.current = routeModule
      // `manual !== null` antes de limpiar: ahora esto persiste, así que un
      // `setSelectedModule(null)` gratis serían una escritura a localStorage
      // y un re-render de todos los suscriptores en cada cambio de módulo,
      // aunque no hubiera nada que limpiar.
      if (manual !== null) setSelectedModule(null)
    }
    // `manual` se lee pero no debe disparar el efecto: cambiarlo a mano (un
    // clic en el riel) no es una navegación, y correr esto ahí lo borraría
    // justo después de elegirlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeModule])

  return { activeModule: manual ?? routeModule, selectModule: setSelectedModule }
}
