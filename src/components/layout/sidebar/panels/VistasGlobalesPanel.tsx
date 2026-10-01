import { Link, useMatchRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon, RoadIcon, Table01Icon, Analytics01Icon, Bookmark01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

const navItemClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-surface-alt transition-colors'
const activeNavItemClass = 'text-accent font-medium'

const ITEMS = [
  { to: '/calendario', icon: Calendar01Icon, label: 'Calendario' },
  { to: '/timeline', icon: RoadIcon, label: 'Timeline' },
  { to: '/tabla', icon: Table01Icon, label: 'Tabla' },
  { to: '/reportes', icon: Analytics01Icon, label: 'Reportes' },
] as const

export function VistasGlobalesPanel({ onNavigate }: { onNavigate?: () => void }) {
  const matchRoute = useMatchRoute()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(navItemClass, !!matchRoute({ to: item.to }) && activeNavItemClass)}
          >
            <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </div>

      {/* "Vistas guardadas": no existe el concepto en el modelo de datos
          todavía (auditoría al planear este panel) — placeholder "Pronto",
          mismo criterio que ya usaba Sidebar.tsx para pendientes reales
          (SidebarPlaceholderItem), no una promesa nueva. */}
      <div className="flex flex-col gap-0.5">
        <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Guardadas</span>
        <div
          title="Próximamente"
          className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-muted/70"
        >
          <HugeiconsIcon icon={Bookmark01Icon} className="size-4 shrink-0 opacity-70" />
          <span className="flex-1 truncate">Vistas guardadas</span>
          <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            Pronto
          </span>
        </div>
      </div>
    </div>
  )
}
