import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useNodeTree } from '@/features/nodes/queries'
import { buildTree, getAncestors } from '@/features/nodes/build-tree'

interface BreadcrumbProps {
  workspaceId: string
  nodeId: string
}

// La cadena de ancestros se deriva client-side del mismo `node-tree` que ya
// usa el Sidebar (mismo queryKey, TanStack Query dedupe el fetch) — sin
// query recursiva propia. Cada ancestro es siempre space/folder (nunca un
// project — un project no puede tener hijos), así que enlaza a `/f/$folderId`
// sin necesidad de distinguir tipo.
export function Breadcrumb({ workspaceId, nodeId }: BreadcrumbProps) {
  const { data: treeRows } = useNodeTree(workspaceId)
  const { byId } = useMemo(() => buildTree(treeRows ?? []), [treeRows])
  const ancestors = useMemo(() => getAncestors(byId, nodeId), [byId, nodeId])

  if (ancestors.length === 0) return null

  return (
    <div className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
      {ancestors.map((node, i) => (
        <span key={node.id} className="flex shrink-0 items-center gap-1">
          {i > 0 && <span className="text-text-muted/50">/</span>}
          <Link to="/f/$folderId" params={{ folderId: node.id }} className="max-w-40 truncate hover:underline">
            {node.name}
          </Link>
        </span>
      ))}
      {/* "/" final: ahora que el título de la lista queda pegado justo
          después del breadcrumb en la misma fila, sin esto no se distingue
          dónde termina uno y empieza el otro. */}
      <span className="text-text-muted/50">/</span>
    </div>
  )
}
