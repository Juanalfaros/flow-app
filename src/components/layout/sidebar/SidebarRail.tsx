import { useState, type ReactNode } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon, Shield01Icon } from '@hugeicons/core-free-icons'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useUnreadNotificationsCount } from '@/features/notifications/queries'
import { useSession } from '@/features/auth/queries'
import { useIsPlatformAdmin } from '@/features/admin/queries'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MOD_KEY_HINT } from '@/lib/platform'
import { RAIL_MODULES, BOTTOM_MODULE, type ModuleDef, type ModuleId } from '@/components/layout/sidebar/modules'
import { SidebarPanel } from '@/components/layout/sidebar/SidebarPanel'
import { cn } from '@/lib/utils'

interface SidebarRailProps {
  activeModule: ModuleId
  onSelectModule: (id: ModuleId) => void
  /** Colapsado: clickear un módulo abre su panel como flyout en vez de
   * mostrar el panel de al lado (que en ese modo no existe). */
  collapsed: boolean
  onNavigate?: () => void
  onOpenPalette?: () => void
}

export function SidebarRail({ activeModule, onSelectModule, collapsed, onNavigate, onOpenPalette }: SidebarRailProps) {
  const { workspace } = useCurrentWorkspace()
  const { data: session } = useSession()
  const { data: unreadCount } = useUnreadNotificationsCount(session?.user.id)
  const isPlatformAdmin = useIsPlatformAdmin()
  const matchRoute = useMatchRoute()
  const [openFlyout, setOpenFlyout] = useState<ModuleId | null>(null)

  function handleModuleClick(id: ModuleId) {
    if (collapsed) {
      setOpenFlyout((prev) => (prev === id ? null : id))
      onSelectModule(id)
    } else {
      onSelectModule(id)
    }
  }

  return (
    <div
      className={cn(
        // p-3 y gap-1, los valores del contrato visual: 12 + botón 36 + 12
        // cierra los 60px exactos, y los 4px entre botones los separan sin
        // que la columna se lea como un bloque continuo. Antes eran p-1.5 y
        // gap-0.5 (el ancho ya daba por el centrado, pero arriba y abajo
        // sobraba la mitad del aire).
        'dark-scope relative flex h-full w-[60px] shrink-0 flex-col items-center gap-1 overflow-visible border bg-surface p-3 text-text',
        'rounded-panel shadow-panel',
      )}
      // El fondo del riel es lo ÚNICO que se tiñe con el acento de la
      // cuenta (`profiles.rail_style`): el panel de al lado se queda
      // grafito siempre, porque el contraste entre los dos es lo que arma
      // la jerarquía. Los valores los escribe use-theme-preference.ts; el
      // fallback deja el grafito de siempre mientras el perfil carga o si
      // la preferencia nunca se tocó.
      style={{
        backgroundColor: 'var(--rail-bg, var(--surface))',
        borderColor: 'var(--rail-border, var(--border))',
      }}
    >
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Cambiar de workspace (próximamente)"
        className="mb-1.5 flex size-7 shrink-0 cursor-default items-center justify-center rounded-md bg-accent text-xs font-semibold text-accent-foreground opacity-90"
      >
        {workspace?.name?.slice(0, 1).toUpperCase() ?? '?'}
      </button>

      {onOpenPalette && (
        <RailTooltip label={`Buscar (${MOD_KEY_HINT})`}>
          <button
            type="button"
            onClick={onOpenPalette}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
          >
            <HugeiconsIcon icon={Search01Icon} className="size-4" />
          </button>
        </RailTooltip>
      )}

      {RAIL_MODULES.map((mod) => (
        <RailButton
          key={mod.id}
          mod={mod}
          active={activeModule === mod.id}
          dot={mod.id === 'bandeja' && !!unreadCount}
          collapsed={collapsed}
          open={openFlyout === mod.id}
          onOpenChange={(open) => setOpenFlyout(open ? mod.id : null)}
          onClick={() => handleModuleClick(mod.id)}
          onNavigate={onNavigate}
        />
      ))}

      <div className="flex-1" />

      <div className="my-1 h-px w-5 shrink-0 bg-border" />

      {/* Administración de plataforma (0095): solo el super admin. Es un
          enlace directo y no un módulo con panel — no tiene árbol ni
          subsecciones, es una sola pantalla. */}
      {isPlatformAdmin && (
        <RailTooltip label="Administración">
          <Link
            to="/admin"
            onClick={onNavigate}
            aria-label="Administración"
            className={cn(
              'relative flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-alt hover:text-text',
              matchRoute({ to: '/admin' }) && 'text-accent',
            )}
            style={
              matchRoute({ to: '/admin' })
                ? { backgroundColor: 'var(--rail-active-bg, var(--accent-soft))', color: 'var(--rail-active-fg, var(--accent))' }
                : undefined
            }
          >
            <HugeiconsIcon icon={Shield01Icon} className="size-4" />
          </Link>
        </RailTooltip>
      )}

      <RailButton
        mod={BOTTOM_MODULE}
        active={activeModule === BOTTOM_MODULE.id}
        collapsed={collapsed}
        open={openFlyout === BOTTOM_MODULE.id}
        onOpenChange={(open) => setOpenFlyout(open ? BOTTOM_MODULE.id : null)}
        onClick={() => handleModuleClick(BOTTOM_MODULE.id)}
        onNavigate={onNavigate}
      />
    </div>
  )
}

function RailTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function RailButton({
  mod,
  active,
  dot,
  collapsed,
  open,
  onOpenChange,
  onClick,
  onNavigate,
}: {
  mod: ModuleDef
  active: boolean
  dot?: boolean
  collapsed: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onClick: () => void
  onNavigate?: () => void
}) {
  const matchRoute = useMatchRoute()
  const route = mod.route
  const isCurrentRoute = route ? !!matchRoute({ to: route }) : false

  const buttonClass = cn(
    'relative flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-alt hover:text-text',
    active && 'text-accent',
  )
  // Sobre un riel ya teñido, el acento al 16% se pierde contra su propio
  // fondo — en modo sólido el activo se marca con blanco (ver
  // deriveRailPalette). Por eso el fondo va por variable y no por clase.
  const activeStyle = active
    ? {
        backgroundColor: 'var(--rail-active-bg, var(--accent-soft))',
        color: 'var(--rail-active-fg, var(--accent))',
      }
    : undefined

  const icon = (
    <span className="relative flex items-center justify-center">
      <HugeiconsIcon icon={mod.icon} className="size-4" />
      {dot && <span className="absolute -top-1 -right-1.5 size-1.5 rounded-full bg-danger" aria-hidden="true" />}
    </span>
  )

  if (collapsed) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <RailTooltip label={mod.label}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-pressed={active}
              aria-label={mod.label}
              onClick={onClick}
              className={buttonClass}
              style={activeStyle}
            >
              {icon}
            </button>
          </PopoverTrigger>
        </RailTooltip>
        <PopoverContent
          side="right"
          align="start"
          // 6px, la misma separación que hay entre el riel y el panel fijo
          // (`gap-1.5` en Sidebar.tsx): el flyout ocupa el lugar del panel,
          // así que tiene que despegarse del riel exactamente igual.
          sideOffset={6}
          // 228px y radio 14: los mismos que el panel fijo, para que abrir
          // el flyout se lea como "el panel de al lado, flotando" y no como
          // otro componente. `w-56` daba 224.
          //
          // `max-h` + `flex flex-col`, no `h-` fijo: con una altura fija,
          // un módulo corto (Mis tareas con 3 filas, Vistas globales con 4)
          // dejaba dos tercios de panel negro vacío debajo — se ve en las
          // capturas. Ahora crece con su contenido y recién al tocar el
          // techo scrollea por dentro; el `flex-col` es lo que deja que
          // `SidebarPanel` se encoja y que su cuerpo con `overflow-y-auto`
          // tome el scroll en vez de que el contenido se corte.
          className="dark-scope flex max-h-[min(70vh,420px)] w-[228px] flex-col rounded-[14px] border-border bg-surface p-0 text-text"
        >
          <SidebarPanel moduleId={mod.id} withChrome={false} onNavigate={onNavigate} />
        </PopoverContent>
      </Popover>
    )
  }

  // Panel abierto: si el módulo tiene una ruta "hogar" propia, el ícono
  // navega Y activa su panel (un solo <Link>, sin duplicar el <button>).
  // Espacios (sin ruta propia) es un botón que solo cambia qué panel se ve.
  if (route) {
    return (
      <RailTooltip label={mod.label}>
        <Link
          to={route}
          onClick={() => {
            onClick()
            onNavigate?.()
          }}
          aria-label={mod.label}
          aria-current={active || isCurrentRoute ? 'page' : undefined}
          className={buttonClass}
          style={activeStyle}
        >
          {icon}
        </Link>
      </RailTooltip>
    )
  }

  return (
    <RailTooltip label={mod.label}>
      <button
        type="button"
        aria-pressed={active}
        aria-label={mod.label}
        onClick={onClick}
        className={buttonClass}
        style={activeStyle}
      >
        {icon}
      </button>
    </RailTooltip>
  )
}
