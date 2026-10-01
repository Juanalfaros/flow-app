import { useState } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Calendar01Icon,
  ChartGanttIcon,
  ChevronDownIcon,
  DashboardSquare01Icon,
  KanbanIcon,
  ListViewIcon,
  Table01Icon,
} from '@hugeicons/core-free-icons'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import type { ProjectViewRoute } from '@/features/projects/last-project-view'
import { cn } from '@/lib/utils'

interface ProjectView {
  to: ProjectViewRoute
  icon: IconSvgElement
  label: string
  /** Vistas que necesitan ancho de verdad (una grilla editable de N
   * columnas, un diagrama de barras con escala temporal). Funcionan en
   * mobile, pero con scroll horizontal — decirlo antes de entrar evita el
   * viaje de ida y vuelta. */
  desktopBetter?: boolean
}

// Suelta, y no `VIEWS[0]`: con `noUncheckedIndexedAccess` el índice 0 de
// un array es `T | undefined`, y esta es la vista de respaldo real cuando
// ninguna ruta coincide (el propio layout del proyecto redirige acá).
const SUMMARY_VIEW: ProjectView = { to: '/p/$projectId/summary', icon: DashboardSquare01Icon, label: 'Resumen' }

const VIEWS: ProjectView[] = [
  SUMMARY_VIEW,
  { to: '/p/$projectId/board', icon: KanbanIcon, label: 'Board' },
  { to: '/p/$projectId/list', icon: ListViewIcon, label: 'Lista' },
  { to: '/p/$projectId/table', icon: Table01Icon, label: 'Tabla', desktopBetter: true },
  { to: '/p/$projectId/calendar', icon: Calendar01Icon, label: 'Calendario' },
  { to: '/p/$projectId/gantt', icon: ChartGanttIcon, label: 'Gantt', desktopBetter: true },
]

function useCurrentView(projectId: string): ProjectView {
  const matchRoute = useMatchRoute()
  return VIEWS.find((v) => !!matchRoute({ to: v.to, params: { projectId } })) ?? SUMMARY_VIEW
}

/** Las 6 vistas como tabs — solo desde md: hacia arriba. En mobile las
 * reemplaza `ProjectViewPicker`. */
export function ProjectViewTabs({ projectId }: { projectId: string }) {
  const current = useCurrentView(projectId)

  return (
    <nav className="hidden gap-0.5 overflow-x-auto rounded-md bg-surface-alt p-0.5 text-sm md:flex">
      {VIEWS.map((view) => {
        const active = view.to === current.to
        return (
          <Link
            key={view.to}
            to={view.to}
            params={{ projectId }}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1 text-text-muted transition-colors hover:text-text',
              active && 'bg-bg text-text shadow-sm',
            )}
          >
            <HugeiconsIcon icon={view.icon} className="size-3.5" />
            {view.label}
          </Link>
        )
      })}
    </nav>
  )
}

// Chip con la vista actual + hoja con las 6, solo en mobile. Va en un
// componente APARTE de las tabs (no los dos dentro del mismo) porque en
// mobile vive en otra fila del header: junto a favorito/"⋯"/compartir, que
// al esconderse el breadcrumb y el nombre se habían quedado solos en una
// franja propia sin nada que los anclara (visto en captura). Ver
// ProjectPageHeader.tsx.
//
// En 390px las 6 tabs entraban ~3,5 y el resto quedaba detrás de un scroll
// horizontal sin ninguna señal de que hubiera más. No es "menos vistas en
// mobile": son las mismas, con una afordancia que se ve.
export function ProjectViewPicker({ projectId }: { projectId: string }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const current = useCurrentView(projectId)

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label={`Vista: ${current.label}. Cambiar de vista`}
        className="flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-medium transition-colors active:bg-surface-alt md:hidden"
      >
        <HugeiconsIcon icon={current.icon} className="size-4 shrink-0 text-text-muted" />
        {current.label}
        <HugeiconsIcon icon={ChevronDownIcon} className="size-3.5 shrink-0 text-text-muted" />
      </button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="border-border bg-surface p-0 text-text data-[side=bottom]:max-h-[85vh]"
        >
          <SheetTitle className="sr-only">Ver como</SheetTitle>
          <div className="flex flex-col px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <span className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
            <p className="mb-1 px-1 text-sm font-semibold">Ver como</p>
            {VIEWS.map((view) => {
              const active = view.to === current.to
              return (
                <Link
                  key={view.to}
                  to={view.to}
                  params={{ projectId }}
                  onClick={() => setSheetOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-13 items-center gap-3 border-b border-border px-1 transition-colors last:border-b-0 active:bg-surface-alt',
                    active && 'text-accent-text-on-bg',
                  )}
                >
                  <HugeiconsIcon icon={view.icon} className={cn('size-5 shrink-0', !active && 'text-text-muted')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{view.label}</span>
                    {(active || view.desktopBetter) && (
                      <span className="block text-xs text-text-muted">
                        {active ? 'Actual' : 'Mejor en escritorio'}
                      </span>
                    )}
                  </span>
                </Link>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
