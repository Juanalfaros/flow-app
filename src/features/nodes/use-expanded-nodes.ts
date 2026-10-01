import { useState } from 'react'
import type { NodeType } from '@/features/nodes/types'

// Generaliza el `useState<Set<string>>` de expand/collapse que antes vivía
// en Sidebar.tsx (solo para spaces) a cualquier nodo del árbol. Se guarda
// el set de ids "tocados manualmente" en vez de el set de expandidos —
// así el default por tipo (space abierto, folder cerrado, igual que
// ClickUp) se aplica sin tener que sembrar el set inicial recorriendo el
// árbol entero antes del primer render.
export function useExpandedNodes() {
  const [toggled, setToggled] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setToggled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function isExpanded(id: string, type: NodeType) {
    const defaultExpanded = type === 'space'
    return toggled.has(id) ? !defaultExpanded : defaultExpanded
  }

  return { isExpanded, toggle }
}
