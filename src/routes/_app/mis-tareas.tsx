import { createFileRoute, redirect } from '@tanstack/react-router'
import { membershipsQueryOptions, useCurrentWorkspace } from '@/features/workspace/queries'
import { sessionQueryOptions, useSession } from '@/features/auth/queries'
import {
  myTasksQueryOptions,
  delegatedTasksQueryOptions,
  personalTasksQueryOptions,
  unassignedRequestedTasksQueryOptions,
} from '@/features/tasks/queries'
import { favoritesQueryOptions } from '@/features/favorites/queries'
import { notificationsQueryOptions } from '@/features/notifications/queries'
import { recentViewsQueryOptions } from '@/features/recent-views/queries'
import { MyTasksPage } from '@/features/my-tasks/components/MyTasksPage'
import { BentoSkeleton } from '@/components/layout/PageSkeletons'

interface MyTasksSearch {
  tab?: 'asignado' | 'personal'
  /** Atajo "Nueva tarea" del ícono de la PWA (manifest.webmanifest,
   * `shortcuts`): entra directo a `?tab=personal&new=1` para enfocar el
   * input de "Lista personal" sin un tap de más. */
  new?: boolean
}

export const Route = createFileRoute('/_app/mis-tareas')({
  validateSearch: (search: Record<string, unknown>): MyTasksSearch => ({
    tab: search.tab === 'personal' ? 'personal' : undefined,
    new: search.new === '1' || search.new === true ? true : undefined,
  }),
  // Ver el comentario equivalente en routes/_app/index.tsx: `beforeLoad`
  // ya deja todo tibio antes de montar, así que el hueco real está en la
  // espera de `beforeLoad` en sí. Auditoría de skeletons.
  pendingComponent: BentoSkeleton,
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    // Ver el comentario equivalente en routes/_app/index.tsx.
    const membership = memberships[0]
    if (!membership) throw redirect({ to: '/onboarding' })

    const workspaceId = membership.workspace_id
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    const userId = session?.user.id

    await Promise.all([
      context.queryClient.ensureQueryData(myTasksQueryOptions(workspaceId, userId)),
      context.queryClient.ensureQueryData(delegatedTasksQueryOptions(workspaceId, userId)),
      context.queryClient.ensureQueryData(unassignedRequestedTasksQueryOptions(workspaceId, userId)),
      context.queryClient.ensureQueryData(personalTasksQueryOptions(workspaceId, userId)),
      context.queryClient.ensureQueryData(favoritesQueryOptions(userId)),
      context.queryClient.ensureQueryData(notificationsQueryOptions(userId, { unreadOnly: true })),
      context.queryClient.ensureQueryData(recentViewsQueryOptions(userId)),
    ])
  },
  component: MyTasksRoute,
})

function MyTasksRoute() {
  const { tab, new: focusCreate } = Route.useSearch()
  const { workspaceId } = useCurrentWorkspace()
  const { data: session } = useSession()

  if (!workspaceId) return null
  return (
    <MyTasksPage
      workspaceId={workspaceId}
      userId={session?.user.id}
      tab={tab ?? 'asignado'}
      focusCreate={focusCreate}
    />
  )
}
