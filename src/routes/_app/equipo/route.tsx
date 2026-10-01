import { createFileRoute, Link, Outlet, useMatchRoute } from '@tanstack/react-router'
import { ErrorState, NotFoundState } from '@/components/layout/ErrorState'
import { InviteMembersDialog } from '@/features/workspace/components/InviteMembersDialog'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { PersonPanel } from '@/features/people/components/PersonPanel'
import { usePersonSearchParam, useSetPersonSearchParam } from '@/features/people/person-param'
import { TeamPanel } from '@/features/teams/components/TeamPanel'
import { useTeamSearchParam, useSetTeamSearchParam } from '@/features/teams/team-param'
import { useEquipoWideLayout } from '@/features/people/use-equipo-wide-layout'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/equipo')({
  // `persona`/`equipo` se validan acá y no en cada hija: los paneles se
  // renderizan en este layout, así que las tres vistas comparten los mismos
  // parámetros y se puede abrir una ficha desde cualquiera sin perder en
  // qué pestaña estabas. `equipo` es del PR4 del rediseño de Equipo — mismo
  // mecanismo que `persona`, ver team-param.ts.
  validateSearch: (search: Record<string, unknown>): { persona?: string; equipo?: string } => ({
    persona: typeof search.persona === 'string' ? search.persona : undefined,
    equipo: typeof search.equipo === 'string' ? search.equipo : undefined,
  }),
  component: EquipoLayout,
  errorComponent: ({ error, reset }) => <ErrorState error={error} onRetry={reset} />,
  notFoundComponent: () => <NotFoundState />,
})

const TABS = [
  { to: '/equipo/personas', label: 'Personas' },
  { to: '/equipo/equipos', label: 'Equipos' },
  { to: '/equipo/organigrama', label: 'Organigrama' },
] as const

function EquipoLayout() {
  const { workspaceId } = useCurrentWorkspace()
  const matchRoute = useMatchRoute()
  const selectedPersonId = usePersonSearchParam()
  const setPerson = useSetPersonSearchParam()
  const selectedTeamId = useTeamSearchParam()
  const setTeam = useSetTeamSearchParam()
  // Corrección 3 de la maqueta de Equipo: la ficha vive AL LADO de la
  // lista en vez de taparla en un Sheet — mismo criterio y mismo umbral
  // que ya usa Bandeja (Decisión 3 de la auditoría de layout original)
  // para su propio panel de detalle. Por debajo del umbral, o en mobile,
  // sigue siendo pantalla completa (ver más abajo), porque no hay ancho
  // real para dos columnas legibles. `persona`/`equipo` son mutuamente
  // excluyentes (los setters se limpian entre sí, ver person-param.ts/
  // team-param.ts), así que basta con "hay algo seleccionado".
  const selection = selectedPersonId ? { kind: 'persona' as const, id: selectedPersonId } : selectedTeamId ? { kind: 'equipo' as const, id: selectedTeamId } : null
  const wide = useEquipoWideLayout()
  const showSplitDetail = wide && !!selection
  // Pantalla completa: reemplaza la lista entera (no un Sheet encima) —
  // mismo botón "Cerrar ficha" que ya trae PersonPanel/TeamPanel hace de
  // "volver", sin duplicar esa afordancia en un back separado.
  const showFullscreenDetail = !wide && !!selection

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Plan de corrección de layout, ronda 3 (2026-09-24) — rediseño de
          Equipo: la nav de acá abajo repetía exactamente los mismos 3
          destinos que EquipoPanel.tsx ya lista en el panel del riel, dos
          niveles de navegación para tres destinos. `md:hidden` en la
          <nav>, no en el <header> entero: desde `md:` el panel del
          sidebar cubre la navegación (mismo corte que decide el resto de
          escritorio vs. mobile en la app), pero "+ Invitar" no vive en
          ningún otro lado, así que el header se queda montado para
          seguir dándole un lugar. En mobile (sin panel) la nav se queda
          como segmentado compacto, mismo patrón que la tira de pestañas
          de profile.tsx. */}
      {/* md:justify-end: con la <nav> escondida en md:, sin esto "+
          Invitar" quedaba pegado a la izquierda — `justify-between` con
          un solo hijo visible no tiene contra quién repartirse.
          `showFullscreenDetail` esconde el header entero: la pantalla
          completa de la ficha no convive con el título/nav de la lista
          que dejó atrás. */}
      {!showFullscreenDetail && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4 md:justify-end">
          <nav className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 md:hidden" aria-label="Secciones de equipo">
            {TABS.map((tab) => {
              const active = !!matchRoute({ to: tab.to, fuzzy: false })
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                    active ? 'border-transparent bg-accent-soft text-accent-text-on-bg' : 'border-border text-text-secondary',
                  )}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
          {workspaceId && <InviteMembersDialog workspaceId={workspaceId} />}
        </header>
      )}

      {showFullscreenDetail ? (
        <div className="min-h-0 flex-1">
          {selection?.kind === 'persona' && <PersonPanel userId={selection.id} onClose={() => setPerson(null)} />}
          {selection?.kind === 'equipo' && <TeamPanel teamId={selection.id} onClose={() => setTeam(null)} />}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <main className="h-full min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
          {/* border-l pl-4, no una tarjeta propia: mismo criterio que el
              panel de detalle de Bandeja (plan de corrección de layout,
              ronda 2) — <main> (AppShell.tsx) ya es la única caja de la
              columna, esto es una columna más al lado, separada por una
              línea. Se monta solo con algo seleccionado: si quedara
              siempre montado y solo oculto, sus pestañas/queries se
              dispararían en cada carga de la sección aunque nadie abriera
              una ficha. */}
          {showSplitDetail && (
            <div className="h-full w-full max-w-md shrink-0 flex-none border-l border-border pl-4">
              {selection?.kind === 'persona' && <PersonPanel userId={selection.id} onClose={() => setPerson(null)} />}
              {selection?.kind === 'equipo' && <TeamPanel teamId={selection.id} onClose={() => setTeam(null)} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
