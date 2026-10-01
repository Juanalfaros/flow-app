// Mapea `profiles.start_page` (0093_profile_preferences_v2.sql:
// 'inicio'|'mis-tareas'|'bandeja') a la ruta real. Se consulta una sola
// vez, justo al iniciar sesión (routes/login.tsx, `beforeLoad` — el mismo
// que hoy redirige siempre a `/`) — no en cada visita a `/`, porque eso
// volvería inalcanzable el ítem "Inicio" del sidebar para quien elige otra
// página de inicio.
//
// Distinto de `default-view.ts` (`default_view`): ese elige la vista
// DENTRO de un proyecto; esto elige a qué página de nivel superior entra
// Flow antes de tocar ningún proyecto.
const ROUTE_BY_START_PAGE: Record<string, string> = {
  inicio: '/',
  'mis-tareas': '/mis-tareas',
  bandeja: '/bandeja',
}

export function startPageToRoute(startPage: string | null | undefined): string {
  return ROUTE_BY_START_PAGE[startPage ?? ''] ?? '/'
}
