import { NodeTreeItem } from '@/features/nodes/components/NodeTreeItem'
import type { TreeNode } from '@/features/nodes/build-tree'
import type { NodeType } from '@/features/nodes/types'

interface NodeTreeProps {
  nodes: TreeNode[]
  workspaceId: string
  activeNodeId?: string
  isExpanded: (id: string, type: NodeType) => boolean
  onToggle: (id: string) => void
  onNavigate?: () => void
}

// Punto de entrada del árbol: renderiza los roots (spaces) al depth 0, cada
// uno se recursa a sí mismo vía NodeTreeItem para profundidad arbitraria.
export function NodeTree({ nodes, workspaceId, activeNodeId, isExpanded, onToggle, onNavigate }: NodeTreeProps) {
  return (
    // A-03: patrón ARIA tree — el root lleva role="tree", cada fila
    // role="treeitem" (ver NodeTreeItem.tsx), los <ul> anidados role="group".
    <ul role="tree" className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <NodeTreeItem
          key={node.id}
          node={node}
          depth={0}
          workspaceId={workspaceId}
          activeNodeId={activeNodeId}
          isExpanded={isExpanded}
          onToggle={onToggle}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  )
}
