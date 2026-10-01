import { useEffect } from 'react'
import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router'
import { useContainerRealtimeChannel } from '@/lib/realtime'
import { ErrorState } from '@/components/layout/ErrorState'
import { setLastProjectView, type ProjectViewRoute } from '@/features/projects/last-project-view'

export const Route = createFileRoute('/_app/p/$projectId')({
  component: ProjectLayout,
  // Acota el fallo al panel de contenido: un projectId de otro workspace (o
  // de un proyecto ya borrado) hace que la query rechace por RLS, y sin esto
  // el error subía hasta `_app` y tumbaba también sidebar y topbar.
  errorComponent: ({ error, reset }) => <ErrorState error={error} onRetry={reset} />,
})

// S-03/S-09: cada vez que se entra a una de las 5 vistas del proyecto se
// guarda como "última vista" (ver last-project-view.ts) — así Favoritos y
// el árbol del sidebar pueden volver ahí en vez de resetear siempre a
// /summary. t.$taskId no cuenta acá: es el detalle de una tarea montado
// sobre la vista activa, no una vista en sí misma.
const VIEW_ROUTES: ProjectViewRoute[] = [
  '/p/$projectId/summary',
  '/p/$projectId/board',
  '/p/$projectId/list',
  '/p/$projectId/calendar',
  '/p/$projectId/gantt',
  '/p/$projectId/table',
]

function ProjectLayout() {
  const { projectId } = Route.useParams()
  useContainerRealtimeChannel(projectId)
  const matchRoute = useMatchRoute()
  const activeView = VIEW_ROUTES.find((to) => matchRoute({ to, params: { projectId } }))

  useEffect(() => {
    if (activeView) setLastProjectView(projectId, activeView)
  }, [projectId, activeView])

  return <Outlet />
}
