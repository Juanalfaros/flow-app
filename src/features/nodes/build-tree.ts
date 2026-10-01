import type { TreeNodeRow } from '@/features/nodes/queries'
import { buildHierarchy, getAncestorsOf, wouldCycle, type TreeOf } from '@/lib/hierarchy'

// El algoritmo (armar el árbol, subir por ancestros, detectar ciclos) vive en
// lib/hierarchy.ts: no depende de ningún campo propio de los nodos, y el
// organigrama de personas —jerarquía por `profiles.manager_id`— necesita
// exactamente lo mismo. Acá quedan solo los alias con los nombres que ya usa
// el resto de features/nodes, para no tocar sus call-sites.

export type TreeNode = TreeOf<TreeNodeRow>

/** Roots = nodos sin `parent_id`, es decir los spaces. */
export function buildTree(rows: TreeNodeRow[]) {
  return buildHierarchy(rows)
}

/** Cadena de ancestros de un nodo, de la raíz hacia abajo — para el breadcrumb. */
export function getAncestors(byId: Map<string, TreeNode>, nodeId: string): TreeNode[] {
  return getAncestorsOf(byId, nodeId)
}

// Validación 100% client-side contra el árbol ya cacheado — sin round-trip
// (ver PLAN.md §4.5): el cliente es el único camino de escritura y siempre
// tiene el árbol completo en memoria, así que un trigger con CTE recursivo en
// Postgres no compraría nada.
export function wouldCreateCycle(byId: Map<string, TreeNode>, nodeId: string, newParentId: string): boolean {
  return wouldCycle(byId, nodeId, newParentId)
}

/**
 * Todos los proyectos (listas) descendientes de un nodo, a cualquier
 * profundidad — para el rollup de la vista de carpeta/espacio (F5 #2.2):
 * el árbol completo del workspace ya está cacheado (`useNodeTree`, mismo
 * dato que arma el Sidebar), así que esto es un recorrido en memoria, sin
 * round-trip ni CTE recursiva en Postgres — mismo criterio que
 * `wouldCreateCycle` arriba.
 */
export function collectDescendantProjectIds(node: TreeNode): string[] {
  const ids: string[] = []
  for (const child of node.children) {
    if (child.type === 'project') ids.push(child.id)
    else ids.push(...collectDescendantProjectIds(child))
  }
  return ids
}

/**
 * Cuenta listas y subcarpetas a cualquier profundidad, no solo hijos
 * directos — para un resumen tipo "X listas · Y carpetas" que refleje todo
 * lo que hay adentro de un espacio, no solo su primer nivel (bug real:
 * `/espacios.tsx` mostraba "0 listas" en espacios donde las listas estaban
 * anidadas dentro de una subcarpeta).
 */
export function countDescendants(node: TreeNode): { projectCount: number; folderCount: number } {
  let projectCount = 0
  let folderCount = 0
  for (const child of node.children) {
    if (child.type === 'project') {
      projectCount++
    } else {
      folderCount++
      const nested = countDescendants(child)
      projectCount += nested.projectCount
      folderCount += nested.folderCount
    }
  }
  return { projectCount, folderCount }
}

/**
 * Aplana el árbol a una lista de opciones "padre posible" para un
 * selector — un proyecto (lista) nunca puede ser padre de otra cosa (ni
 * carpeta ni lista), así que se excluye; el resto (spaces/folders) entra
 * con su nombre indentado según profundidad. Antes vivía copiado literal
 * en NewProjectDialog.tsx y NewFolderDialog.tsx (auditoría de
 * optimización 2026-09-16, D3) — una carpeta acepta los mismos padres
 * que una lista, es la misma lista aplanada en los dos casos.
 *
 * Las dos copias habían divergido en un detalle invisible a simple
 * vista: NewProjectDialog.tsx indentaba con espacios NBSP (U+00A0) y
 * NewFolderDialog.tsx con espacios ASCII comunes — un <SelectItem> no
 * tiene `white-space: pre`, así que el navegador colapsa espacios ASCII
 * seguidos a uno solo. La copia de NewFolderDialog nunca mostró
 * indentación de verdad; esta versión usa NBSP (el comportamiento que sí
 * funciona), así que unificar acá también corrige eso de paso.
 */
export function flattenParentOptions(nodes: TreeNode[], depth = 0): { id: string; label: string }[] {
  const options: { id: string; label: string }[] = []
  for (const node of nodes) {
    if (node.type === 'project') continue
    options.push({ id: node.id, label: `${'  '.repeat(depth)}${node.name}` })
    options.push(...flattenParentOptions(node.children, depth + 1))
  }
  return options
}
