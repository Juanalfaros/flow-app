// Iniciales para los AvatarFallback. Estaba duplicada literalmente en 7
// archivos más (UserMenu, CalendarTaskChip, CommentList, GanttRow,
// TaskPresenceAvatars, members.tsx, profile.tsx) — misma implementación, solo
// variaba la firma. Acepta `undefined` además de `null` para cubrir a todos
// los llamadores sin que ninguno tenga que normalizar antes.
export function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
