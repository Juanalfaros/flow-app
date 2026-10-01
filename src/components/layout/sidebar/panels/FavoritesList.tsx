import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon } from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import { useSession } from '@/features/auth/queries'
import { useFavoriteProjects } from '@/features/favorites/queries'
import { useLastProjectView, type ProjectViewRoute } from '@/features/projects/last-project-view'
import { useProfile } from '@/features/profile/queries'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { cn } from '@/lib/utils'

const navItemClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-surface-alt transition-colors'
const activeNavItemClass = 'text-accent font-medium'

/**
 * Favoritos, reusado tal cual en el panel de Inicio y en el de Espacios
 * (el propio mockup los repite en los dos módulos — acceso rápido desde
 * cualquiera de los dos). Ya no necesita una variante "colapsada": el
 * riel colapsado ahora solo muestra los 7 íconos de módulo (ver
 * modules.ts) — browsear favoritos/árbol colapsado pasa por el flyout,
 * que renderiza este mismo panel completo, no una versión aparte.
 */
export function FavoritesList({ activeNodeId, onNavigate }: { activeNodeId?: string; onNavigate?: () => void }) {
  const { data: session } = useSession()
  const { data: sidebarProfile } = useProfile(session?.user.id ?? '')
  const defaultViewRoute = defaultViewToRoute(sidebarProfile?.default_view)
  const { data: favorites } = useFavoriteProjects(session?.user.id)

  if (!favorites || favorites.length === 0) {
    return <p className="px-2 text-xs text-text-muted">Sin favoritos todavía.</p>
  }

  return (
    <div className="flex flex-col gap-0.5">
      {favorites.map((f) => (
        <FavoriteLink
          key={f.node_id}
          nodeId={f.node_id}
          nodeType={f.node.type}
          name={f.node.name}
          active={activeNodeId === f.node_id}
          onNavigate={onNavigate}
          defaultViewRoute={defaultViewRoute}
        />
      ))}
    </div>
  )
}

function FavoriteLink({
  nodeId,
  nodeType,
  name,
  active,
  onNavigate,
  defaultViewRoute,
}: {
  nodeId: string
  /** Espacios/carpetas favoritos navegan a /f/$folderId; proyectos, a su
   * última vista recordada — ver useLastProjectView más abajo. */
  nodeType: string
  name: string
  active: boolean
  onNavigate?: () => void
  defaultViewRoute: ProjectViewRoute
}) {
  const lastView = useLastProjectView(nodeId, defaultViewRoute)
  const linkProps =
    nodeType === 'project'
      ? { to: lastView as '/p/$projectId/summary', params: { projectId: nodeId } }
      : { to: '/f/$folderId' as const, params: { folderId: nodeId } }
  return (
    <Link {...linkProps} onClick={onNavigate} className={cn(navItemClass, active && activeNavItemClass)}>
      <HugeiconsIcon icon={StarIcon} className="size-4 shrink-0 fill-accent-2 text-accent-2" />
      <span className="flex-1 truncate">{name}</span>
    </Link>
  )
}
