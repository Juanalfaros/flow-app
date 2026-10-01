// Paleta de series para el portafolio y el gráfico de horas (rediseño de
// Reportes, mockup: https://claude.ai/artifact/UtZT4mb5RAYrGzuYCqbNLU,
// tokens --s1..--s5). Reusa los 10 tokens --tag-* de index.css en vez de
// definir una paleta nueva — a diferencia de TAG_PALETTE (labels/
// tag-colors.ts, hex fijo a propósito porque el color de una etiqueta no
// debe cambiar con el tema), acá se referencian las variables CSS
// directamente para que sí cambien con claro/oscuro, como el resto de la
// página.
const SPACE_COLOR_VARS = [
  'var(--tag-azul)',
  'var(--tag-naranja)',
  'var(--tag-teal)',
  'var(--tag-ambar)',
  'var(--tag-rosa)',
  'var(--tag-violeta)',
  'var(--tag-verde)',
  'var(--tag-celeste)',
] as const

export function spaceColor(index: number): string {
  return SPACE_COLOR_VARS[index % SPACE_COLOR_VARS.length]!
}

// Nombres de etapa del mockup para status_kind — status-kind.ts ya trae el
// mapeo de color/severidad (STATUS_KIND_DOT/BADGE) pero sus labels son de
// severidad ("Éxito", "Peligro"), no de etapa de flujo. Mismo mapeo
// interpretado que ya documenta ese archivo (neutral→Por hacer,
// success→Hecha, warning→En revisión, danger→Bloqueada,
// dropped→Descartada), en el orden que usa el mockup para la barra
// apilada de avance.
export const STAGE_ORDER = ['success', 'warning', 'danger', 'neutral', 'dropped'] as const
export const STAGE_LABEL: Record<string, string> = {
  success: 'Hecha',
  warning: 'En revisión',
  danger: 'Bloqueada',
  neutral: 'Por hacer',
  dropped: 'Descartada',
}

export type Health = 'empty' | 'done' | 'ok' | 'warn' | 'bad'

export const HEALTH_LABEL: Record<Health, string> = {
  empty: 'Sin tareas',
  done: 'Completado',
  ok: 'En curso',
  warn: 'En riesgo',
  bad: 'Atrasado',
}

export const HEALTH_CLASS: Record<Health, string> = {
  empty: 'bg-surface-alt text-text-muted',
  done: 'bg-accent-soft text-accent-text-on-bg',
  ok: 'bg-success-bg text-success-text',
  warn: 'bg-warn-bg text-warn-text',
  bad: 'bg-danger-bg text-danger-text',
}

/**
 * Regla de salud del mockup (anexo, "a acordar"): atrasado si un hito
 * próximo ya venció o si ≥20% de las abiertas están vencidas; en riesgo
 * si ≥10% están vencidas, o si el próximo hito vence en ≤10 días y hay
 * tareas bloqueadas; en curso el resto. Se calcula acá en el cliente (no
 * en get_report_data, 0091) porque combina campos que la función ya
 * devuelve sueltos — abiertas, vencidas, próximo hito y bloqueadas — sin
 * necesitar otro número nuevo del servidor.
 *
 * `empty`/`done` van ANTES que esa regla, no como un caso más: con
 * `openCount = 0` la razón `overdueCount/openCount` de abajo se fuerza a
 * 0 y el resultado caía en "ok" ("En curso") aunque el proyecto ya
 * hubiera terminado todo — reportado por el usuario viendo Reportes
 * (una lista 100% completada seguía mostrando "En curso"). Como
 * `openCount`/`totalCount` sí cuentan los hitos (son tareas con
 * `is_milestone = true`, mismo `base_tasks` de 0091_report_data.sql),
 * "Completado" ya exige que también los hitos estén cerrados, sin
 * lógica aparte. Es 100% derivado — sin columna nueva ni botón: en
 * cuanto se crea una tarea o hito nuevo, `openCount` deja de ser 0 y el
 * proyecto vuelve a calcularse solo.
 */
export function computeHealth(params: {
  totalCount: number
  openCount: number
  overdueCount: number
  blockedCount: number
  milestoneOverdue: boolean
  milestoneDueDate: string | null
}): Health {
  if (params.totalCount === 0) return 'empty'
  if (params.openCount === 0) return 'done'

  const ratio = params.overdueCount / params.openCount
  const daysUntilMilestone = params.milestoneDueDate
    ? Math.ceil((new Date(params.milestoneDueDate).getTime() - Date.now()) / 86_400_000)
    : null
  const milestoneSoonBlocked = daysUntilMilestone !== null && daysUntilMilestone <= 10 && params.blockedCount > 0

  if (params.milestoneOverdue || ratio >= 0.2) return 'bad'
  if (ratio >= 0.1 || milestoneSoonBlocked) return 'warn'
  return 'ok'
}
