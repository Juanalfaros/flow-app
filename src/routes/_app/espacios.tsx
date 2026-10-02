import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon, ChevronRightIcon, PlusSignIcon, Folder02Icon, FolderAddIcon, CheckListIcon } from '@hugeicons/core-free-icons'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useNodeTree } from '@/features/nodes/queries'
import { buildTree, countDescendants, type TreeNode } from '@/features/nodes/build-tree'
import { useHiddenNodeIds } from '@/features/hidden-nodes/queries'
import { useFavoriteProjects } from '@/features/favorites/queries'
import { useLastProjectView } from '@/features/projects/last-project-view'
import { useProfile } from '@/features/profile/queries'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { NodeIconSwatch } from '@/features/nodes/components/NodeIconSwatch'
import { NewSpaceDialog } from '@/features/nodes/components/NewSpaceDialog'
import { NewFolderDialog } from '@/features/nodes/components/NewFolderDialog'
import { NewProjectDialog } from '@/features/projects/components/NewProjectDialog'
import { MobileCreateMenu } from '@/components/layout/MobileCreateMenu'
import { PageShell } from '@/components/layout/PageShell'
import { getNodeAppearance } from '@/features/nodes/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ListSkeleton } from '@/features/projects/components/ProjectViewSkeleton'

// Landing del módulo "Espacios" en la tab bar móvil (Fase 2 del rediseño
// de navegación) — no existía ninguna ruta que listara los espacios de
// nivel superior sin abrir el sidebar. Cada espacio se puede expandir in
// situ (chevron, sin navegar) para ver sus carpetas/listas sin salir de
// esta pantalla — el nombre/ícono sí navega a /f/$folderId (que YA maneja
// tanto spaces como folders) para "entrar" de verdad. Antes el chevron
// era parte del mismo <Link> que el resto de la fila y siempre navegaba
// (bug real reportado: no había forma de solo desplegar el árbol).
export const Route = createFileRoute('/_app/espacios')({
  pendingComponent: () => (
    <PageShell width="prose">
      <ListSkeleton />
    </PageShell>
  ),
  component: EspaciosPage,
})

function EspaciosPage() {
  const { data: session } = useSession()
  const { workspaceId } = useCurrentWorkspace()
  const { data: treeRows } = useNodeTree(workspaceId)
  const { data: favorites } = useFavoriteProjects(session?.user.id)
  const hiddenNodeIds = useHiddenNodeIds(session?.user.id)
  const { data: profile } = useProfile(session?.user.id ?? '')
  const defaultViewRoute = defaultViewToRoute(profile?.default_view)
  const [newSpaceOpen, setNewSpaceOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  // Reportado por el usuario: el "+" de esta pantalla solo ofrecía
  // "Crear espacio" — no había forma de armar una carpeta o una lista
  // desde el teléfono sin entrar primero a un espacio. Ahora abre una
  // hoja con las mismas 3 opciones que ya tiene el "+" de Espacios en el
  // sidebar de escritorio (EspaciosPanel.tsx), en el mismo orden.
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const { roots } = useMemo(() => buildTree(treeRows ?? []), [treeRows])
  const visibleRoots = useMemo(() => roots.filter((r) => !hiddenNodeIds.has(r.id)), [roots, hiddenNodeIds])

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <PageShell width="prose" className="gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Espacios</h1>
        {workspaceId && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Crear espacio, carpeta o lista"
            onClick={() => setCreateMenuOpen(true)}
          >
            <HugeiconsIcon icon={PlusSignIcon} />
          </Button>
        )}
      </div>

      {favorites && favorites.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="px-1 text-xs font-medium text-text-muted uppercase">Favoritos</span>
          {favorites.map((f) => (
            <FavoriteRow key={f.node_id} nodeId={f.node_id} nodeType={f.node.type} name={f.node.name} defaultViewRoute={defaultViewRoute} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="px-1 text-xs font-medium text-text-muted uppercase">Todos los espacios</span>
        {treeRows === undefined ? null : visibleRoots.length === 0 ? (
          // Plan de corrección de layout (2026-09-24), Corrección 3: sin
          // marco punteado — ícono y texto centrados, igual que el resto
          // de los vacíos de la app.
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <HugeiconsIcon icon={Folder02Icon} className="size-6 text-text-muted/60" />
            <p className="text-sm text-text-muted">Sin espacios todavía.</p>
            <Button variant="outline" size="sm" onClick={() => setNewSpaceOpen(true)}>
              <HugeiconsIcon icon={PlusSignIcon} />
              Crear espacio
            </Button>
          </div>
        ) : (
          visibleRoots.map((space) => (
            <SpaceRow
              key={space.id}
              node={space}
              depth={0}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpanded}
              defaultViewRoute={defaultViewRoute}
              // Si ningún espacio tiene hijos no hay chevrones: no dejar 36px vacíos a la izquierda.
              reserveToggle={visibleRoots.some((r) => r.children.length > 0)}
            />
          ))
        )}
      </div>

      {workspaceId && (
        <>
          <MobileCreateMenu
            open={createMenuOpen}
            onOpenChange={setCreateMenuOpen}
            title="Crear en Espacios"
            options={[
              {
                key: 'space',
                icon: PlusSignIcon,
                label: 'Espacio',
                description: 'El nivel más alto — agrupa carpetas y listas',
                onSelect: () => setNewSpaceOpen(true),
              },
              {
                key: 'folder',
                icon: FolderAddIcon,
                label: 'Carpeta',
                description: 'Agrupa listas dentro de un espacio',
                onSelect: () => setNewFolderOpen(true),
              },
              {
                key: 'project',
                icon: CheckListIcon,
                label: 'Lista',
                description: 'Donde viven las tareas',
                onSelect: () => setNewProjectOpen(true),
              },
            ]}
          />
          <NewSpaceDialog workspaceId={workspaceId} open={newSpaceOpen} onOpenChange={setNewSpaceOpen} />
          {/* Sin `parentId`: NewFolderDialog ya sabe mostrar el selector de
              ubicación cuando se crea desde "afuera" de un nodo puntual —
              mismo comportamiento que el "+" de EspaciosPanel.tsx en
              escritorio. */}
          <NewFolderDialog workspaceId={workspaceId} open={newFolderOpen} onOpenChange={setNewFolderOpen} />
          <NewProjectDialog
            workspaceId={workspaceId}
            trigger="none"
            open={newProjectOpen}
            onOpenChange={setNewProjectOpen}
          />
        </>
      )}
    </PageShell>
  )
}

// Fila del árbol expandible: el chevron (un <button> aparte, no parte del
// <Link>) solo despliega/colapsa los hijos in situ, sin navegar — tocar el
// ícono/nombre navega a /f/$folderId, igual que antes. Recursiva: cada
// subcarpeta expandida se renderiza a sí misma un nivel más profundo, mismo
// criterio de indentación (`6 + depth * 14`) que NodeTreeItem.tsx usa en el
// árbol de escritorio.
function SpaceRow({
  node,
  depth,
  expandedIds,
  onToggleExpand,
  defaultViewRoute,
  reserveToggle = true,
}: {
  node: TreeNode
  depth: number
  /** Deja el hueco del chevron aunque este nodo no tenga hijos, para alinear con los hermanos que sí. */
  reserveToggle?: boolean
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  defaultViewRoute: ReturnType<typeof defaultViewToRoute>
}) {
  const isSpace = node.type === 'space'
  const hasChildren = node.children.length > 0
  const expanded = expandedIds.has(node.id)
  // El resumen recursivo (listas/carpetas a cualquier profundidad) solo
  // tiene sentido en la raíz — un espacio entero, no cada subcarpeta
  // desplegada, donde ya se ve el contenido directo debajo.
  const { projectCount, folderCount } = useMemo(() => (depth === 0 ? countDescendants(node) : { projectCount: 0, folderCount: 0 }), [node, depth])

  return (
    <div>
      <div className="flex items-center gap-0.5" style={{ paddingLeft: 6 + depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleExpand(node.id)}
            aria-label={expanded ? 'Contraer' : 'Expandir'}
            aria-expanded={expanded}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors active:bg-surface-alt"
          >
            <HugeiconsIcon icon={ChevronRightIcon} className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
          </button>
        ) : reserveToggle ? (
          <span className="size-9 shrink-0" />
        ) : null}
        <Link
          to="/f/$folderId"
          params={{ folderId: node.id }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md p-2 transition-colors active:bg-surface-alt hover:bg-surface-alt"
        >
          {isSpace ? (
            <NodeIconSwatch name={node.name} appearance={getNodeAppearance(node.custom_fields)} />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-alt">
              <HugeiconsIcon icon={Folder02Icon} className="size-4 text-text-muted" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{node.name}</span>
            {depth === 0 && (
              <span className="block text-xs text-text-muted">
                {projectCount} lista{projectCount === 1 ? '' : 's'}
                {folderCount > 0 ? ` · ${folderCount} carpeta${folderCount === 1 ? '' : 's'}` : ''}
              </span>
            )}
          </span>
          {/* Chevron de NAVEGACIÓN, a la derecha — distinto del de la
              izquierda, que solo despliega. Sin este, la fila no tenía
              ninguna señal de que además de expandirse se puede entrar:
              las dos afordancias vivían en el mismo ícono y ninguna se
              anunciaba. Mismo lugar y mismo rol que en el prototipo. */}
          <HugeiconsIcon icon={ChevronRightIcon} className="size-4 shrink-0 text-text-muted" />
        </Link>
      </div>
      {expanded && (
        <div className="flex flex-col gap-0.5">
          {node.children.map((child) =>
            child.type === 'project' ? (
              <ListLeafRow key={child.id} projectId={child.id} name={child.name} depth={depth + 1} defaultViewRoute={defaultViewRoute} />
            ) : (
              <SpaceRow
                key={child.id}
                node={child}
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                defaultViewRoute={defaultViewRoute}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

function ListLeafRow({
  projectId,
  name,
  depth,
  defaultViewRoute,
}: {
  projectId: string
  name: string
  depth: number
  defaultViewRoute: ReturnType<typeof defaultViewToRoute>
}) {
  const lastView = useLastProjectView(projectId, defaultViewRoute)
  return (
    <Link
      to={lastView}
      params={{ projectId }}
      className="flex min-h-11 items-center gap-2 rounded-md p-2 transition-colors active:bg-surface-alt hover:bg-surface-alt"
      style={{ paddingLeft: 6 + 36 + depth * 14 }}
    >
      <HugeiconsIcon icon={CheckListIcon} className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <HugeiconsIcon icon={ChevronRightIcon} className="size-4 shrink-0 text-text-muted" />
    </Link>
  )
}

function FavoriteRow({
  nodeId,
  nodeType,
  name,
  defaultViewRoute,
}: {
  nodeId: string
  nodeType: string
  name: string
  defaultViewRoute: ReturnType<typeof defaultViewToRoute>
}) {
  const lastView = useLastProjectView(nodeId, defaultViewRoute)
  const linkProps =
    nodeType === 'project'
      ? { to: lastView as '/p/$projectId/summary', params: { projectId: nodeId } }
      : { to: '/f/$folderId' as const, params: { folderId: nodeId } }
  return (
    <Link
      {...linkProps}
      className="flex min-h-11 items-center gap-2 rounded-md p-2 transition-colors active:bg-surface-alt hover:bg-surface-alt"
    >
      <HugeiconsIcon icon={StarIcon} className="size-4 shrink-0 fill-accent-2 text-accent-2" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <HugeiconsIcon icon={ChevronRightIcon} className="size-4 shrink-0 text-text-muted" />
    </Link>
  )
}
