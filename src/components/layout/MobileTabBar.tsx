import { useState } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Home01Icon, InboxIcon, CheckListIcon, GridViewIcon, MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { MobileMoreSheet, MORE_ROUTES } from '@/components/layout/MobileMoreSheet'
import { useSession } from '@/features/auth/queries'
import { useUnreadNotificationsCount } from '@/features/notifications/queries'
import { useIsKeyboardOpen } from '@/lib/use-keyboard-open'
import { cn } from '@/lib/utils'

// Fase 2 del rediseño de navegación (móvil): reemplaza el botón de
// hamburguesa + Sheet con el sidebar entero (Topbar.tsx, ya sacado) por
// una tab bar fija abajo — el patrón que la gente ya sabe usar en una
// app instalada, en vez de un riel vertical de íconos que en 375px se
// come el ancho y queda lejos del pulgar. 4 de los 7 módulos entran
// directo (tienen una página "hogar" real); el resto vive en la pestaña
// "Más", ahora una lista plana de destinos (MobileMoreSheet.tsx).
const TABS = [
  { to: '/' as const, icon: Home01Icon, label: 'Inicio' },
  { to: '/bandeja' as const, icon: InboxIcon, label: 'Bandeja' },
  { to: '/mis-tareas' as const, icon: CheckListIcon, label: 'Mis tareas' },
  { to: '/espacios' as const, icon: GridViewIcon, label: 'Espacios' },
]

/** También la usa AppShell.tsx para reservar el padding inferior del
 * contenido y para montar el FAB — los tres tienen que coincidir en
 * cuándo la barra está realmente visible. */
export function useShowMobileTabBar(): boolean {
  const matchRoute = useMatchRoute()
  const isKeyboardOpen = useIsKeyboardOpen()
  // Detalle de tarea a pantalla completa: la cabecera contextual ya trae
  // el "atrás" con el nombre de la lista (Topbar.tsx) — una segunda barra
  // de navegación fija abajo compite por el mismo pulgar sin aportar nada,
  // y le roba una fila entera de alto a la pantalla más angosta de toda la
  // app (el detalle de tarea, con campos + comentarios).
  const isFullTask = !!matchRoute({ to: '/p/$projectId/t/$taskId' })
  return !isFullTask && !isKeyboardOpen
}

export function MobileTabBar() {
  const show = useShowMobileTabBar()
  const matchRoute = useMatchRoute()
  const { data: session } = useSession()
  const { data: unreadCount } = useUnreadNotificationsCount(session?.user.id)
  const [masOpen, setMasOpen] = useState(false)

  // Activa "Más" si la ruta actual es uno de sus destinos, para no dejar
  // la tab bar entera sin ningún ítem resaltado. La lista sale de la
  // propia hoja (MORE_ROUTES) en vez de repetirse a mano acá — antes
  // había que acordarse de agregar cada ruta nueva en los dos lados.
  const isMasRoute = MORE_ROUTES.some((to) => !!matchRoute({ to }))

  return (
    <>
      {/* `dark-scope`: la barra se queda grafito en los dos temas, igual que
          el Sidebar en escritorio — es chrome de navegación, no contenido
          de la app. Decisión explícita del usuario, mantenida a pedido
          suyo después de probar la variante que seguía el tema (el
          prototipo la pinta clara en tema claro; acá gana la coherencia
          con el riel de escritorio). Todo lo de adentro hereda la paleta
          oscura, así que `text-accent` (#40E0D0 sobre #151515) rinde ~11:1
          y no hace falta el token `-on-bg`. */}
      <nav
        aria-label="Navegación principal"
        className={cn(
          'dark-scope fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface text-text pt-1 pb-[calc(4px+env(safe-area-inset-bottom))] md:hidden',
          !show && 'hidden',
        )}
      >
        {TABS.map((tab) => {
          const active = !!matchRoute({ to: tab.to })
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                'relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors active:bg-surface-alt',
                active ? 'font-semibold text-accent' : 'text-text-muted',
              )}
            >
              <span className="relative">
                <HugeiconsIcon icon={tab.icon} className="size-5" />
                {/* El conteo, no un punto: "tenés algo sin leer" y "tenés 12
                    sin leer" son decisiones distintas, y el dato ya venía
                    en la query — el punto lo tiraba a la basura. El borde
                    del color de la barra despega el badge del ícono cuando
                    se superponen. */}
                {!!unreadCount && (
                  <span className="absolute -top-1.5 left-1/2 ml-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-surface bg-danger px-1 text-[9px] font-semibold text-white tabular-nums">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMasOpen(true)}
          className={cn(
            'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors active:bg-surface-alt',
            isMasRoute ? 'font-semibold text-accent' : 'text-text-muted',
          )}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} className="size-5" />
          Más
        </button>
      </nav>

      <MobileMoreSheet open={masOpen} onOpenChange={setMasOpen} />
    </>
  )
}
