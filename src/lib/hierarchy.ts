/**
 * Utilidades de jerarquía por `parent_id`, genéricas.
 *
 * Extraído de `features/nodes/build-tree.ts`, que estaba atado a `TreeNodeRow`
 * aunque el algoritmo no depende de ningún campo propio de los nodos. El
 * organigrama de personas (`profiles.manager_id`) necesita exactamente lo
 * mismo: armar el árbol, subir por la cadena de ancestros y detectar ciclos.
 * Duplicarlo habría dejado dos implementaciones del mismo recorrido para
 * mantener en paralelo.
 */

/** Lo mínimo que necesita una fila para formar parte de una jerarquía. */
export interface HierarchyRow {
  id: string
  parent_id: string | null
}

export type TreeOf<T extends HierarchyRow> = T & { children: TreeOf<T>[] }

/**
 * Arma el árbol en un solo pase O(n) y devuelve también el índice por id.
 *
 * `roots` son las filas sin padre — o cuyo padre no está en el conjunto, que
 * es lo que pasa cuando la lista viene filtrada por permisos: esas filas se
 * promueven a raíz en vez de desaparecer del árbol.
 */
export function buildHierarchy<T extends HierarchyRow>(rows: T[]): {
  roots: TreeOf<T>[]
  byId: Map<string, TreeOf<T>>
} {
  const byId = new Map<string, TreeOf<T>>()
  for (const row of rows) byId.set(row.id, { ...row, children: [] })

  const roots: TreeOf<T>[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return { roots, byId }
}

/** Ancestros de una fila, de la raíz hacia abajo, sin incluirla a ella. */
export function getAncestorsOf<T extends HierarchyRow>(
  byId: Map<string, TreeOf<T>>,
  id: string,
): TreeOf<T>[] {
  const chain: TreeOf<T>[] = []
  const start = byId.get(id)
  let current = start?.parent_id ? byId.get(start.parent_id) : undefined
  while (current) {
    chain.unshift(current)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }
  return chain
}

/**
 * ¿Colgar `id` de `newParentId` cerraría un ciclo? Verdadero si son el mismo,
 * o si `newParentId` ya desciende de `id`.
 *
 * El recorrido está acotado por `byId.size`: si los datos ya vinieran con un
 * ciclo (algo que la base impide, pero que un cache a medio actualizar podría
 * simular), el `while` no terminaría nunca y colgaría la pestaña.
 */
export function wouldCycle<T extends HierarchyRow>(
  byId: Map<string, TreeOf<T>>,
  id: string,
  newParentId: string,
): boolean {
  if (id === newParentId) return true
  let current = byId.get(newParentId)
  let guard = byId.size
  while (current && guard-- > 0) {
    if (current.id === id) return true
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }
  return false
}
