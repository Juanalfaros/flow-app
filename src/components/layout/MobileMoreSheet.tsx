import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Analytics01Icon,
  Archive01Icon,
  BellIcon,
  Building06Icon,
  Calendar01Icon,
  ChevronRightIcon,
  Copy01Icon,
  Globe02Icon,
  ListSettingIcon,
  Logout01Icon,
  Moon02Icon,
  RoadIcon,
  Shield01Icon,
  Sun01Icon,
  Table01Icon,
  UserCircleIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { signOut } from '@/features/auth/api'
import { useIsPlatformAdmin } from '@/features/admin/queries'
import { useThemePreference } from '@/features/profile/use-theme-preference'
import { cn } from '@/lib/utils'

// Lista PLANA de destinos, no un conmutador de paneles de escritorio.
//
// La versión anterior de esta hoja montaba `SidebarPanel` tal cual: una
// fila de 3 chips (Vistas globales/Equipo/Ajustes) que cambiaba el panel
// de abajo. Eso significaba dos taps para llegar a cualquier lado, y
// estirar a 390px un panel diseñado para un riel de 256px — densidad de
// escritorio, estados `hover:` que en táctil no existen y una jerarquía
// (título de módulo + subtítulos + sub-links indentados) que en una hoja
// de 80vh no se lee. Acá cada destino REAL es una fila propia de 52px con
// su ícono, a un solo tap, agrupadas por encabezado — el patrón del
// prototipo móvil. El panel de escritorio sigue intacto donde tiene
// sentido (SidebarPanel.tsx, el riel), esto no lo reemplaza.
interface MoreItem {
  label: string
  icon: IconSvgElement
  /** Las rutas de /profile viajan como `search`, no como path — son
   * pestañas del mismo componente (ver AjustesPanel.tsx). */
  to: '/calendario' | '/timeline' | '/tabla' | '/reportes' | '/equipo/personas' | '/equipo/equipos' | '/equipo/organigrama' | '/plantillas' | '/campos-personalizados' | '/archivados' | '/profile' | '/admin'
  search?: { tab: 'perfil' | 'seguridad' | 'workspace' | 'notifications' | 'preferences' | 'integrations' }
}

interface MoreGroup {
  heading: string
  items: MoreItem[]
}

const GROUPS: MoreGroup[] = [
  {
    heading: 'Vistas globales',
    items: [
      { label: 'Calendario', icon: Calendar01Icon, to: '/calendario' },
      { label: 'Timeline', icon: RoadIcon, to: '/timeline' },
      { label: 'Tabla', icon: Table01Icon, to: '/tabla' },
      { label: 'Reportes', icon: Analytics01Icon, to: '/reportes' },
    ],
  },
  {
    heading: 'Equipo',
    items: [
      { label: 'Personas', icon: UserGroupIcon, to: '/equipo/personas' },
      { label: 'Equipos', icon: UserGroupIcon, to: '/equipo/equipos' },
      { label: 'Organigrama', icon: UserGroupIcon, to: '/equipo/organigrama' },
    ],
  },
  {
    heading: 'Espacio de trabajo',
    items: [
      { label: 'Plantillas', icon: Copy01Icon, to: '/plantillas' },
      { label: 'Campos personalizados', icon: ListSettingIcon, to: '/campos-personalizados' },
      { label: 'Archivados', icon: Archive01Icon, to: '/archivados' },
      { label: 'Miembros e invitaciones', icon: Building06Icon, to: '/profile', search: { tab: 'workspace' } },
    ],
  },
  {
    heading: 'Cuenta',
    items: [
      { label: 'Perfil', icon: UserCircleIcon, to: '/profile', search: { tab: 'perfil' } },
      { label: 'Seguridad', icon: Shield01Icon, to: '/profile', search: { tab: 'seguridad' } },
      { label: 'Preferencias', icon: Globe02Icon, to: '/profile', search: { tab: 'preferences' } },
      { label: 'Notificaciones', icon: BellIcon, to: '/profile', search: { tab: 'notifications' } },
    ],
  },
]

/** Las rutas que hacen que la pestaña "Más" cuente como activa — se deriva
 * de los propios destinos de la hoja en vez de repetirlas a mano en
 * MobileTabBar.tsx (que era donde se olvidaban al agregar una). */
const ADMIN_GROUP: MoreGroup = {
  heading: 'Plataforma',
  items: [{ label: 'Administración', icon: Shield01Icon, to: '/admin' }],
}

export const MORE_ROUTES = [...GROUPS, ADMIN_GROUP].flatMap((g) => g.items.map((i) => i.to))

const rowClass =
  'flex min-h-13 w-full items-center gap-3 border-b border-border px-1 text-left transition-colors active:bg-surface-alt'

export function MobileMoreSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const matchRoute = useMatchRoute()
  const { resolvedTheme, setTheme } = useThemePreference()
  const isPlatformAdmin = useIsPlatformAdmin()
  const groups = isPlatformAdmin ? [...GROUPS, ADMIN_GROUP] : GROUPS
  const isDark = resolvedTheme === 'dark'
  const queryClient = useQueryClient()
  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: () => queryClient.clear(),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // `dark-scope`: mismo criterio que la tab bar desde la que se abre
        // (MobileTabBar.tsx) y que el Sidebar en escritorio — esta hoja ES
        // el menú de navegación, no contenido de la app, así que se queda
        // grafito en los dos temas. Las otras dos hojas nuevas ("Ver como"
        // y "Nueva tarea") sí siguen el tema: pertenecen a la pantalla que
        // se está mirando, no a la navegación.
        //
        // `max-h-[85vh]`, no `h-[85vh]`: el primitivo ya trae
        // `data-[side=bottom]:h-auto`, así que alcanza con topear el máximo
        // — la hoja crece con su contenido y recién ahí scrollea adentro
        // (bug real: con altura fija quedaba medio fondo vacío). Hay que
        // repetir el prefijo `data-[side=bottom]:` exacto para ganarle al
        // merge de tailwind-merge, ver AppShell.tsx.
        className="dark-scope flex flex-col border-border bg-surface p-0 text-text data-[side=bottom]:max-h-[85vh]"
      >
        <SheetTitle className="sr-only">Más</SheetTitle>
        {/* Grabber: la hoja se puede cerrar tocando afuera o arrastrando,
            pero sin esta barrita nada lo dice — es la única señal de "esto
            es una hoja" que la gente ya reconoce. */}
        <div className="shrink-0 pt-2 pb-1">
          <span className="mx-auto block h-1 w-9 rounded-full bg-border-strong" aria-hidden="true" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {groups.map((group) => (
            <div key={group.heading}>
              <p className="mt-4 mb-1 px-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
                {group.heading}
              </p>
              {group.items.map((item) => {
                const active = !!matchRoute({ to: item.to, ...(item.search ? { search: item.search } : {}) })
                return (
                  <Link
                    key={`${item.to}-${item.label}`}
                    to={item.to}
                    search={item.search}
                    onClick={() => onOpenChange(false)}
                    className={cn(rowClass, active && 'text-accent')}
                  >
                    <HugeiconsIcon icon={item.icon} className="size-5 shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                    <HugeiconsIcon icon={ChevronRightIcon} className="size-4 shrink-0 text-text-muted" />
                  </Link>
                )
              })}
            </div>
          ))}

          <p className="mt-4 mb-1 px-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">Aplicación</p>
          {/* Tema y Cerrar sesión viven acá porque en las pantallas de
              drill-down el Topbar ya no muestra ni el toggle ni el avatar
              (no entran junto al "atrás" + título en 390px, ver
              Topbar.tsx) — sin esto quedarían sin ningún camino en mobile. */}
          <button type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')} className={rowClass}>
            <HugeiconsIcon icon={isDark ? Moon02Icon : Sun01Icon} className="size-5 shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">Tema</span>
            <span className="shrink-0 text-xs text-text-muted">{isDark ? 'Oscuro' : 'Claro'}</span>
          </button>
          <button
            type="button"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
            className={cn(rowClass, 'border-b-0 text-danger-text')}
          >
            <HugeiconsIcon icon={Logout01Icon} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">Cerrar sesión</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
