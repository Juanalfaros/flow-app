import { useEffect, useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, FolderAddIcon, CheckListIcon } from '@hugeicons/core-free-icons'
import { useDragSensors } from '@/lib/drag-sensors'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useNodeTree } from '@/features/nodes/queries'
import { buildTree, getAncestors, wouldCreateCycle } from '@/features/nodes/build-tree'
import { useExpandedNodes } from '@/features/nodes/use-expanded-nodes'
import { useMoveNodeMutation } from '@/features/nodes/mutations'
import { useHiddenNodeIds } from '@/features/hidden-nodes/queries'
import { NodeTree } from '@/features/nodes/components/NodeTree'
import { NewProjectDialog } from '@/features/projects/components/NewProjectDialog'
import { NewFolderDialog } from '@/features/nodes/components/NewFolderDialog'
import { NewSpaceDialog } from '@/features/nodes/components/NewSpaceDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FavoritesList } from '@/components/layout/sidebar/panels/FavoritesList'

// Puerto casi textual del cuerpo de Sidebar.tsx antes del rediseño de
// navegación (riel + panel) — Favoritos + árbol completo con DnD, sin
// cambios de datos. `NodeTree`/el drag&drop/`NodeIconSwatch` quedan
// intactos, solo cambia dónde vive este bloque.
export function EspaciosPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaceId } = useCurrentWorkspace()
  const { data: session } = useSession()
  const { data: treeRows } = useNodeTree(workspaceId)
  const { projectId: activeProjectId, folderId: activeFolderId } = useParams({ strict: false })
  const activeNodeId = activeProjectId ?? activeFolderId
  const { isExpanded, toggle } = useExpandedNodes()
  const moveNodeMutation = useMoveNodeMutation(workspaceId)
  const [newSpaceOpen, setNewSpaceOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  const { roots, byId } = useMemo(() => buildTree(treeRows ?? []), [treeRows])
  const hiddenNodeIds = useHiddenNodeIds(session?.user.id)
  const visibleRoots = useMemo(() => roots.filter((r) => !hiddenNodeIds.has(r.id)), [roots, hiddenNodeIds])

  // Auto-expandir + scrollear a la fila activa — mismo criterio que antes
  // (auditoría de navegación 2026-09-14): entrar a una tarea/lista desde
  // cualquier lado que no sea clickear la fila del árbol a mano no debe
  // dejarla invisible dentro de una carpeta colapsada.
  useEffect(() => {
    if (!activeNodeId) return
    for (const ancestor of getAncestors(byId, activeNodeId)) {
      if (!isExpanded(ancestor.id, ancestor.type)) toggle(ancestor.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `isExpanded`/`toggle` son estables entre renders (useState setters + closure sobre el mismo Set), y agregarlos re-dispararía el efecto en cada toggle propio.
  }, [activeNodeId, byId])

  useEffect(() => {
    if (!activeNodeId) return
    const frame = requestAnimationFrame(() => {
      document.querySelector(`[data-node-id="${CSS.escape(activeNodeId)}"]`)?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [activeNodeId])

  const sensors = useDragSensors()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const nodeId = String(active.id)
    const newParentId = String(over.id)
    if (nodeId === newParentId) return
    if (wouldCreateCycle(byId, nodeId, newParentId)) return
    const current = byId.get(nodeId)
    if (current?.parent_id === newParentId) return
    moveNodeMutation.mutate({ nodeId, newParentId })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Favoritos</span>
        <FavoritesList activeNodeId={activeNodeId} onNavigate={onNavigate} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-text-muted uppercase">Espacios</span>
          {workspaceId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Crear espacio, carpeta o lista">
                  <HugeiconsIcon icon={PlusSignIcon} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setNewSpaceOpen(true)}>
                  <HugeiconsIcon icon={PlusSignIcon} />
                  Espacio
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setNewFolderOpen(true)}>
                  <HugeiconsIcon icon={FolderAddIcon} />
                  Carpeta
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setNewProjectOpen(true)}>
                  <HugeiconsIcon icon={CheckListIcon} />
                  Lista
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {visibleRoots.length === 0 && (
          <div className="flex flex-col items-start gap-1.5 px-1.5 py-1">
            <p className="text-xs text-text-muted">Sin espacios todavía.</p>
            <Button variant="outline" size="sm" onClick={() => setNewSpaceOpen(true)}>
              <HugeiconsIcon icon={PlusSignIcon} />
              Crear espacio
            </Button>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <NodeTree
            nodes={visibleRoots}
            workspaceId={workspaceId}
            activeNodeId={activeNodeId}
            isExpanded={isExpanded}
            onToggle={toggle}
            onNavigate={onNavigate}
          />
        </DndContext>
      </div>

      {workspaceId && (
        <>
          <NewSpaceDialog workspaceId={workspaceId} open={newSpaceOpen} onOpenChange={setNewSpaceOpen} />
          <NewFolderDialog workspaceId={workspaceId} open={newFolderOpen} onOpenChange={setNewFolderOpen} />
          <NewProjectDialog
            workspaceId={workspaceId}
            trigger="none"
            open={newProjectOpen}
            onOpenChange={setNewProjectOpen}
          />
        </>
      )}
    </div>
  )
}
