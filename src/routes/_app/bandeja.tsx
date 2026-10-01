import { createFileRoute, redirect } from '@tanstack/react-router'
import { membershipsQueryOptions, useCurrentWorkspace } from '@/features/workspace/queries'
import { sessionQueryOptions, useSession } from '@/features/auth/queries'
import { notificationsQueryOptions } from '@/features/notifications/queries'
import { InboxPage, type InboxFilter } from '@/features/notifications/components/InboxPage'
import { useInboxSplitPane } from '@/features/notifications/use-inbox-split-pane'
import { ListSkeleton } from '@/features/projects/components/ProjectViewSkeleton'
import { PageShell } from '@/components/layout/PageShell'

const VALID_FILTERS: InboxFilter[] = ['unread', 'all', 'mention', 'assigned', 'watched_activity']

interface BandejaSearch {
  filter?: InboxFilter
  /** Notificación (por id de TAREA, no de notificación) abierta en el
   * panel de detalle — solo tiene efecto visible desde @min-[1440px]:
   * ver use-inbox-split-pane.ts. Vive en la URL, no en un useState, para
   * que un link directo a "Bandeja con esta tarea abierta" sea
   * compartible y sobreviva a una recarga — mismo criterio que `filter`. */
  open?: string
}

export const Route = createFileRoute('/_app/bandeja')({
  // Rediseño de navegación (panel de Bandeja): "Menciones"/"Asignadas a
  // mí"/"Siguiendo" del sidebar linkean directo a `?filter=`, mismo
  // patrón que `tab` en routes/_app/mis-tareas.tsx.
  validateSearch: (search: Record<string, unknown>): BandejaSearch => ({
    filter: VALID_FILTERS.includes(search.filter as InboxFilter) ? (search.filter as InboxFilter) : undefined,
    open: typeof search.open === 'string' ? search.open : undefined,
  }),
  // Mismo motivo que index.tsx: `beforeLoad` ya deja las notificaciones
  // tibias en caché antes de montar InboxPage, así que el hueco real está
  // en la espera de `beforeLoad` en sí — sin esto, no había nada que
  // mostrar durante la carga inicial en frío. Auditoría de skeletons.
  pendingComponent: BandejaSkeleton,
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    if (memberships.length === 0) throw redirect({ to: '/onboarding' })

    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    const userId = session?.user.id

    // Una sola query (`all`, sin `unreadOnly`): las 5 pestañas del panel
    // (Sin leer/Todas/Menciones/Asignadas a mí/Siguiendo) se filtran
    // client-side sobre esta misma lista — ver InboxPage.tsx. Antes se
    // pedían "todas" y "no leídas" por separado (2 round-trips) para
    // exactamente 2 pestañas; con 5 pestañas, filtrar en el cliente sobre
    // una sola lista de hasta 50 filas es más simple y más barato que 5
    // variantes de la misma query.
    await context.queryClient.ensureQueryData(notificationsQueryOptions(userId))
  },
  component: BandejaRoute,
})

// Mismo hook que InboxPage.tsx usa para decidir su propio ancho
// (`width={showSplitPane ? 'app' : 'prose'}`, Corrección 4 del plan de
// corrección de layout) — sin esto, el esqueleto de carga y la página
// real podían mostrar dos anchos distintos según de qué lado de
// @min-[1440px] estuviera la ventana, saltando de ancho justo cuando
// terminan de llegar las notificaciones.
function BandejaSkeleton() {
  const showSplitPane = useInboxSplitPane()
  return (
    <PageShell width={showSplitPane ? 'app' : 'prose'}>
      <ListSkeleton />
    </PageShell>
  )
}

function BandejaRoute() {
  const { workspaceId } = useCurrentWorkspace()
  const { data: session } = useSession()
  const { filter, open } = Route.useSearch()
  const navigate = Route.useNavigate()

  if (!workspaceId) return null
  return (
    <InboxPage
      workspaceId={workspaceId}
      userId={session?.user.id}
      filter={filter ?? 'unread'}
      onFilterChange={(next) => navigate({ search: (prev) => ({ ...prev, filter: next }) })}
      openTaskId={open ?? null}
      onOpenTaskChange={(taskId) => navigate({ search: (prev) => ({ ...prev, open: taskId ?? undefined }) })}
    />
  )
}
