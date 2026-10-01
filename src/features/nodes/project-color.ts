import { TAG_PALETTE } from '@/features/labels/tag-colors'

// S-06: las vistas globales de Calendario/Timeline cruzan tareas de varios
// proyectos a la vez — sin ninguna forma de distinguir "esto es de qué
// lista" de un vistazo, mezclarlas no aporta nada sobre mirar cada
// proyecto por separado. Reusa la misma paleta de 10 colores que ya usan
// las etiquetas (tag-colors.ts) en vez de inventar una nueva.
//
// Hash simple y determinístico (no cripto, no hace falta) — mismo
// projectId siempre cae en el mismo color, estable entre renders/sesiones
// sin necesidad de guardar nada.
export function projectColor(projectId: string): string {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % TAG_PALETTE.length
  // El módulo ya garantiza 0 <= index < TAG_PALETTE.length — noUncheckedIndexedAccess
  // no puede verlo, así que el fallback es solo para conformar al compilador.
  return TAG_PALETTE[index]?.hex ?? TAG_PALETTE[0].hex
}
