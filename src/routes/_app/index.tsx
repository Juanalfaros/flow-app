import { createFileRoute, redirect } from '@tanstack/react-router'
import { membershipsQueryOptions, useCurrentWorkspace } from '@/features/workspace/queries'
import { projectsQueryOptions, useProjects } from '@/features/projects/queries'
import { sessionQueryOptions } from '@/features/auth/queries'
import { favoritesQueryOptions } from '@/features/favorites/queries'
import { myTasksQueryOptions } from '@/features/tasks/queries'
import { workspaceActivityQueryOptions } from '@/features/activity/queries'
import { myOpenTasksQueryOptions, pendingReviewsQueryOptions, recentlyUnblockedQueryOptions } from '@/features/home/queries'
import { EmptyWorkspaceState } from '@/features/home/components/EmptyWorkspaceState'
import { HomeDashboard } from '@/features/home/components/HomeDashboard'
import { BentoSkeleton } from '@/components/layout/PageSkeletons'

export const Route = createFileRoute('/_app/')({
  // `beforeLoad` bloquea la navegación hasta que las queries de abajo
  // resuelven — por diseño (evita el flash de "no leídos"/tareas en 0
  // mientras llega la respuesta real), pero eso mismo significa que
  // `isLoading` nunca es true DENTRO del componente: cuando monta, los
  // datos ya están tibios en caché. El hueco real está ACÁ, en la espera
  // de `beforeLoad` — sin `pendingComponent`, esa espera no mostraba nada
  // (carga inicial en frío, o red lenta en una navegación normal).
  // Auditoría de skeletons (2026-09-14).
  pendingComponent: BentoSkeleton,
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    // Se comprueba el elemento y no `length === 0`: es la misma condición, pero
    // el estrechamiento sí alcanza al acceso por índice de la línea siguiente.
    const membership = memberships[0]
    if (!membership) throw redirect({ to: '/onboarding' })

    const workspaceId = membership.workspace_id
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    const userId = session?.user.id

    // Precachea todo lo que la home necesita para no mostrar un flash en
    // blanco en la primera carga — no bloquea nada nuevo: `session` ya
    // estaba asegurada por el beforeLoad de `_app` (cache hit, staleTime:
    // Infinity).
    await Promise.all([
      context.queryClient.ensureQueryData(projectsQueryOptions(workspaceId)),
      context.queryClient.ensureQueryData(favoritesQueryOptions(userId)),
      context.queryClient.ensureQueryData(myTasksQueryOptions(workspaceId, userId)),
      context.queryClient.ensureQueryData(workspaceActivityQueryOptions(workspaceId)),
      context.queryClient.ensureQueryData(myOpenTasksQueryOptions(workspaceId, userId)),
      context.queryClient.ensureQueryData(pendingReviewsQueryOptions(userId)),
      context.queryClient.ensureQueryData(recentlyUnblockedQueryOptions(userId)),
    ])
  },
  component: HomePage,
})

function HomePage() {
  const { workspaceId } = useCurrentWorkspace()
  const { data: projects } = useProjects(workspaceId)

  if (!workspaceId || !projects) return null
  return projects.length === 0 ? (
    <EmptyWorkspaceState workspaceId={workspaceId} />
  ) : (
    <HomeDashboard workspaceId={workspaceId} />
  )
}
