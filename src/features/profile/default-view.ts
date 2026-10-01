import type { ProjectViewRoute } from '@/features/projects/last-project-view'

// Mapea `profiles.default_view` (0058_profile_preferences.sql:
// 'list'|'board'|'calendar'|'table') a la ruta real del proyecto. Es el
// fallback que usa `useLastProjectView` cuando todavía no hay una "última
// vista" recordada para ese proyecto en particular (localStorage) — o sea,
// la primera vez que la persona entra a cualquier proyecto tras elegir su
// preferencia. No incluye 'summary'/'gantt': no son opciones ofrecidas en
// Preferencias, mismo criterio que el mock original (una sola opción de
// ejemplo, "Tablero").
const ROUTE_BY_DEFAULT_VIEW: Record<string, ProjectViewRoute> = {
  list: '/p/$projectId/list',
  board: '/p/$projectId/board',
  calendar: '/p/$projectId/calendar',
  table: '/p/$projectId/table',
}

export function defaultViewToRoute(defaultView: string | null | undefined): ProjectViewRoute {
  return ROUTE_BY_DEFAULT_VIEW[defaultView ?? ''] ?? '/p/$projectId/summary'
}
