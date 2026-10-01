// Única fuente de verdad para color/label de `status_kind`. El enum de
// la base (neutral/success/warning/danger/dropped, ver 0001_init.sql +
// 0080_dropped_status.sql) es de severidad, no de etapa de flujo — no hay
// 1:1 con los 6 tokens --status-todo/inprogress/inreview/done/blocked/
// dropped (esos modelan etapas: por-hacer/en-progreso/en-revisión/hecho/
// bloqueado/descartado). Se resuelve con un mapeo interpretado:
// neutral→todo, success→done, warning→inreview, danger→blocked,
// dropped→dropped. "inprogress" queda sin usar hasta que el schema tenga
// una etapa propia — no vale la pena inventar heurísticas sobre el
// nombre libre del estado para adivinarla.
export const STATUS_KINDS = ['neutral', 'success', 'warning', 'danger', 'dropped'] as const
export type StatusKind = (typeof STATUS_KINDS)[number]

// Record<string, string> a propósito: `statuses.status_kind` tipa como
// `string` llano (check constraint en Postgres, no enum a nivel TS), así
// que los call-sites indexan con ese `string` ancho, no con `StatusKind`.
export const STATUS_KIND_LABEL: Record<string, string> = {
  neutral: 'Neutral',
  success: 'Éxito',
  warning: 'Advertencia',
  danger: 'Peligro',
  dropped: 'Descartado',
}

/**
 * ¿Este estado significa "terminada"?
 *
 * La comparación `status_kind === 'success'` estaba repetida en MyWorkWidget,
 * MyTasksSection, SubtaskList y la ficha de persona. Vive acá porque es una
 * interpretación del enum de severidad, no un dato: el día que el esquema tenga
 * una etapa de flujo propia (ver la nota de arriba sobre "inprogress"), este es
 * el único lugar a cambiar.
 *
 * Se compara contra `status_kind` y no contra el nombre del estado a propósito:
 * el nombre es libre y el usuario puede renombrar "Hecho" a "Publicado" sin que
 * eso cambie su semántica.
 *
 * OJO: 'dropped' devuelve `false` acá A PROPÓSITO — "Descartado" no es un
 * matiz de "Hecho" (decisión de producto: "Cerrar con subtareas abiertas"),
 * no debe sumar a ningún contador de completadas ni disparar el tachado de
 * "hecha". Para "¿esta tarea ya no está activa?" (sin importar si se hizo o
 * se descartó) usar `isClosedStatus`, no negar este helper.
 */
export function isDoneStatus(statusKind: string | null | undefined): boolean {
  return statusKind === 'success'
}

/**
 * ¿Esta tarea salió del flujo de trabajo activo? (hecha O descartada).
 *
 * Para "¿cuento esto como trabajo pendiente?" en widgets de Mis tareas/
 * reportes/dígest — antes esos lugares negaban `isDoneStatus` para decidir
 * "sigue abierta", lo que hacía que una tarea recién descartada volviera a
 * aparecer como pendiente (ni está hecha, así que `!isDoneStatus` daba
 * `true`). `isClosedStatus` es el helper correcto para esa pregunta;
 * `isDoneStatus` sigue siendo el correcto para "¿se completó de verdad?"
 * (progreso, tachado, contadores de completadas).
 */
export function isClosedStatus(statusKind: string | null | undefined): boolean {
  return statusKind === 'success' || statusKind === 'dropped'
}

export const STATUS_KIND_DOT: Record<string, string> = {
  neutral: 'bg-status-todo',
  success: 'bg-status-done',
  warning: 'bg-status-inreview',
  danger: 'bg-status-blocked',
  dropped: 'bg-status-dropped',
}

export const STATUS_KIND_BADGE: Record<string, string> = {
  neutral: 'bg-status-todo-bg text-status-todo',
  success: 'bg-status-done-bg text-status-done',
  warning: 'bg-status-inreview-bg text-status-inreview',
  danger: 'bg-status-blocked-bg text-status-blocked',
  dropped: 'bg-status-dropped-bg text-status-dropped',
}
