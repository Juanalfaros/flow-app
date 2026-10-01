import { Link, useParams } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Home01Icon } from '@hugeicons/core-free-icons'
import { useRecentViews } from '@/features/recent-views/queries'
import { useSession } from '@/features/auth/queries'
import { FavoritesList } from '@/components/layout/sidebar/panels/FavoritesList'

const navItemClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-surface-alt transition-colors'

const RECENT_VIEWS_LIMIT = 6

// "Actividad reciente" vivía acá Y en la página (RecentActivitySection) —
// duplicada, plan de corrección de layout, Corrección 2: lo que es
// NAVEGACIÓN (saltar a un favorito, a una vista reciente) se queda en el
// panel; lo que es CONTENIDO para leer (el feed de actividad del
// workspace) es de la página, no del panel. Se saca de acá, la página lo
// sigue mostrando tal cual.
//
// "Vistas recientes" reusa la misma query que ya alimenta RecentWidget.tsx
// (mismo cache, sin round-trips nuevos) — sí es navegación pura (saltar a
// la última tarea que se miró), por eso se queda. Ojo: `recordView`
// trackea TAREAS vistas, no "vistas de proyecto" (Board/Gantt/Tabla), así
// que cada fila es "· <título de la tarea>", no "Board · <proyecto>" como
// en la maqueta original — es lo que el dato realmente permite.
export function InicioPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { projectId, folderId } = useParams({ strict: false })
  const activeNodeId = projectId ?? folderId
  const { data: session } = useSession()
  const { data: recentViews } = useRecentViews(session?.user.id)

  return (
    <div className="flex flex-col gap-3">
      <Link to="/" onClick={onNavigate} className={navItemClass}>
        <HugeiconsIcon icon={Home01Icon} className="size-4 shrink-0" />
        Resumen del día
      </Link>

      <div className="flex flex-col gap-0.5">
        <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Favoritos</span>
        <FavoritesList activeNodeId={activeNodeId} onNavigate={onNavigate} />
      </div>

      {recentViews && recentViews.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Vistas recientes</span>
          {recentViews.slice(0, RECENT_VIEWS_LIMIT).map((v) => {
            const viewProjectId = v.node?.memberships[0]?.container_id
            if (!v.node || !viewProjectId) return null
            return (
              <Link
                key={v.node_id}
                to="/p/$projectId/t/$taskId"
                params={{ projectId: viewProjectId, taskId: v.node.id }}
                onClick={onNavigate}
                className="flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-sm text-text-muted hover:bg-surface-alt hover:text-text"
              >
                <span className="truncate">{v.node.title}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
