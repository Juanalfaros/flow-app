import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon, Folder02Icon } from '@hugeicons/core-free-icons'
import { useFavoriteProjects } from '@/features/favorites/queries'
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton'
import { SectionCard } from '@/features/home/components/SectionCard'
import { useProfile } from '@/features/profile/queries'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { useLastProjectView, type ProjectViewRoute } from '@/features/projects/last-project-view'

interface FavoriteProjectsSectionProps {
  userId: string | undefined
  className?: string
}

export function FavoriteProjectsSection({ userId, className }: FavoriteProjectsSectionProps) {
  const { data: favorites } = useFavoriteProjects(userId)
  const { data: profile } = useProfile(userId ?? '')
  const defaultViewRoute = defaultViewToRoute(profile?.default_view)

  return (
    <SectionCard icon={StarIcon} title="Favoritos" className={className}>
      {favorites === undefined ? null : favorites.length === 0 ? (
        // Plan de corrección de layout, ronda 2 (2026-09-24): sin marco
        // punteado, ícono y texto centrados — mismo criterio que el resto
        // de los vacíos de la app desde la Corrección 3.
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <HugeiconsIcon icon={StarIcon} className="size-5 text-text-muted/60" />
          <p className="text-xs text-text-muted">Aún no tienes listas favoritas. Marca una ⭐ desde cualquier lista.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {favorites.map((f) => (
            <li
              key={f.node_id}
              className="flex min-h-11 items-center gap-1 rounded-md transition-colors active:bg-surface-alt hover:bg-surface-alt"
            >
              <FavoriteSectionLink
                nodeId={f.node_id}
                nodeType={f.node.type}
                name={f.node.name}
                defaultViewRoute={defaultViewRoute}
              />
              <FavoriteButton nodeId={f.node_id} nodeName={f.node.name} nodeType="project" />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

// Componente aparte (no inline en el .map): useLastProjectView es un hook,
// y llamarlo directo dentro del callback de `favorites.map` rompería las
// reglas de hooks apenas cambiara la cantidad de favoritos entre renders
// — mismo motivo y mismo molde que FavoriteLink (components/layout/Sidebar.tsx).
function FavoriteSectionLink({
  nodeId,
  nodeType,
  name,
  defaultViewRoute,
}: {
  nodeId: string
  /** useFavoriteProjects también trae espacios/carpetas favoritos, no solo
   * proyectos — cada tipo navega a su propia ruta. */
  nodeType: string
  name: string
  defaultViewRoute: ProjectViewRoute
}) {
  // Antes iba siempre a /summary — mismo criterio que el árbol/favoritos
  // del sidebar (S-03/S-09): respeta la última vista visitada de esta
  // lista, o la vista por defecto de la cuenta si todavía no visitó
  // ninguna. El hook se llama igual para espacio/carpeta (reglas de
  // hooks), simplemente no se usa en esa rama.
  const lastView = useLastProjectView(nodeId, defaultViewRoute)
  const linkProps =
    nodeType === 'project'
      ? { to: lastView, params: { projectId: nodeId } }
      : { to: '/f/$folderId' as const, params: { folderId: nodeId } }
  return (
    <Link {...linkProps} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm">
      <HugeiconsIcon icon={Folder02Icon} className="size-4 shrink-0 text-text-muted" />
      <span className="truncate">{name}</span>
    </Link>
  )
}
