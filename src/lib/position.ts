const INITIAL_GAP = 1000
const MIN_GAP = 0.0001

/**
 * Devuelve una posición estrictamente entre `prev` y `next`.
 * `prev`/`next` en `undefined` representan el borde de la lista.
 */
export function between(prev?: number, next?: number): number {
  if (prev == null && next == null) return INITIAL_GAP
  if (prev == null) return next! / 2
  if (next == null) return prev + INITIAL_GAP
  return (prev + next) / 2
}

/** true si el hueco entre vecinos ya es demasiado chico y toca llamar a
 * la función SQL `rebalance_positions(project_id)` antes de insertar. */
export function needsRebalance(prev?: number, next?: number): boolean {
  if (prev == null || next == null) return false
  return Math.abs(next - prev) < MIN_GAP
}
