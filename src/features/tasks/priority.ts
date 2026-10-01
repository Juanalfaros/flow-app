// Única fuente de verdad para color/label de prioridad — antes vivía
// duplicado (con la misma forma, distinto grado de completitud) en
// TaskCard, TaskRow, NodeDetailContent, FilterBar y useNodeViewController.
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

// De mayor a menor urgencia (orden inverso a PRIORITIES) — fuente única
// para agrupar (useNodeViewController.groupTasks) y ordenar (sortTasks)
// por prioridad, antes duplicado como const local en useNodeViewController.
export const PRIORITY_URGENCY_ORDER = [...PRIORITIES].reverse()

// Record<string, string> (no Record<Priority, string>) a propósito: el
// tipo generado de Supabase para `tasks.priority` es `string` llano (el
// enum vive como check constraint en Postgres, no como tipo), así que
// todos los call-sites indexan con ese `string` ancho.
export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

// Escalada de color de menor a mayor urgencia: gris → acento primario →
// ámbar (acento secundario) → rojo. Antes low/medium compartían el mismo
// gris sin distinción real.
export const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-text-muted',
  medium: 'bg-accent',
  high: 'bg-accent-2',
  urgent: 'bg-danger',
}

export const PRIORITY_TEXT: Record<string, string> = {
  low: 'text-text-muted',
  medium: 'text-accent',
  high: 'text-accent-2-hover',
  urgent: 'text-danger',
}

// Pill "pintado" (fondo suave + texto del mismo color) para selects de
// prioridad — mismo patrón que STATUS_KIND_BADGE en status-kind.ts, pero
// sin tokens `-bg` dedicados (esos solo existen para status_kind): se
// arma con opacidad sobre el color sólido en vez de inventar tokens
// nuevos para 4 valores que no cambian.
export const PRIORITY_BADGE: Record<string, string> = {
  low: 'bg-text-muted/15 text-text-muted',
  medium: 'bg-accent/15 text-accent',
  high: 'bg-accent-2/15 text-accent-2-hover',
  urgent: 'bg-danger/15 text-danger',
}
