import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { sessionQueryOptions, useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useWorkspacePresence } from '@/features/people/use-workspace-presence'
import { acceptPendingInvitationsQueryOptions } from '@/features/workspace/queries'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorState, NotFoundState } from '@/components/layout/ErrorState'
import { useNodeSearchParam, useSetNodeSearchParam } from '@/lib/node-param'

export const Route = createFileRoute('/_app')({
  // `node` vive acá (no en board.tsx/list.tsx, que declaran su propio
  // `validateSearch` para TaskFilters) porque el Sideview/Dialog de
  // detalle de tarea se renderiza en AppShell, que envuelve TODA la app
  // autenticada — no solo las rutas de proyecto. Ver src/lib/node-param.ts.
  validateSearch: (search: Record<string, unknown>): { node?: string } => ({
    node: typeof search.node === 'string' ? search.node : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    if (!session) {
      throw redirect({ to: '/login' })
    }
    // Antes de que index.tsx decida si redirigir a /onboarding: si el
    // usuario tenía una invitación pendiente, esto le crea la membership
    // real y evita que caiga en onboarding (crearía un workspace nuevo).
    await context.queryClient.ensureQueryData(acceptPendingInvitationsQueryOptions())
  },
  component: AppLayout,
  // Dentro del AppShell: si falla una query de la app autenticada, el usuario
  // conserva sidebar y topbar para navegar a otra parte en vez de quedarse
  // con la pantalla entera rota (a diferencia del errorComponent de __root,
  // que no puede asumir que hay sesión).
  errorComponent: ({ error, reset }) => (
    <AppShell selectedNodeId={null} onCloseNode={() => {}}>
      <ErrorState error={error} onRetry={reset} />
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell selectedNodeId={null} onCloseNode={() => {}}>
      <NotFoundState />
    </AppShell>
  ),
})

function AppLayout() {
  // El canal de presencia se monta acá y en ningún otro lado: es UNO por
  // pestaña, no uno por vista que quiera saber quién está en línea. Montarlo en
  // el layout también hace que la presencia siga viva mientras se navega entre
  // secciones, en vez de reconectarse en cada cambio de ruta.
  const { workspaceId } = useCurrentWorkspace()
  const { data: session } = useSession()
  useWorkspacePresence(workspaceId, session?.user.id)

  // No usar `Route.useNavigate()` acá para cerrar: sin `to` explícito
  // resuelve relativo a `/_app` (no a la ruta hija activa —
  // board/list/detalle), perdiendo la ruta actual. `useSetNodeSearchParam`
  // ya resuelve esto fijando `to` al pathname actual — ver node-param.ts.
  const node = useNodeSearchParam()
  const setNode = useSetNodeSearchParam()

  return (
    <AppShell selectedNodeId={node} onCloseNode={() => setNode(null)}>
      <Outlet />
    </AppShell>
  )
}
