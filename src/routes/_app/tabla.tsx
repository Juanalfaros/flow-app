import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Table01Icon } from '@hugeicons/core-free-icons'
import { applyTaskFilters, FilterBar, type TaskFilters } from '@/features/projects/components/FilterBar'
import { SearchPopover } from '@/features/projects/components/SearchPopover'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useProjects, workspaceStatusesQueryOptions } from '@/features/projects/queries'
import { useSubtreeTasks } from '@/features/tasks/queries'
import { GlobalTableView } from '@/features/tasks/components/GlobalTableView'
import { TASK_SORTS } from '@/features/nodes/useNodeViewController'
import { ListSkeleton } from '@/features/projects/components/ProjectViewSkeleton'

export const Route = createFileRoute('/_app/tabla')({
  // Mismo `validateSearch` que calendario.tsx/timeline.tsx (S-06): sin
  // ProjectPageHeader/ProjectToolbar acá (no hay un solo proyecto del que
  // colgar esos filtros/orden), así que se resuelven a mano en la propia
  // ruta.
  validateSearch: (search: Record<string, unknown>): TaskFilters => ({
    labelId: typeof search.labelId === 'string' ? search.labelId : undefined,
    assigneeIds: Array.isArray(search.assigneeIds)
      ? search.assigneeIds.filter((v): v is string => typeof v === 'string')
      : undefined,
    priority: typeof search.priority === 'string' ? search.priority : undefined,
    sort: TASK_SORTS.includes(search.sort as (typeof TASK_SORTS)[number])
      ? (search.sort as (typeof TASK_SORTS)[number])
      : undefined,
  }),
  component: GlobalTablePage,
})

// Versión "todas las listas a la vez" de la Tabla por proyecto (F5 #4) —
// mismo patrón que ya usan Calendario/Timeline globales: useSubtreeTasks
// sobre todos los proyectos del workspace, sin ProjectToolbar (no hay un
// solo proyecto). Ver GlobalTableView.tsx para las diferencias con la
// tabla de un solo proyecto (sin campos personalizados, columna "Lista").
function GlobalTablePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { workspaceId } = useCurrentWorkspace()
  const { data: projects, isPending: projectsPending } = useProjects(workspaceId ?? '')
  const containerIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])
  const projectsById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects])
  const { data: tasks, isPending: tasksPending } = useSubtreeTasks(containerIds)
  const { data: statuses } = useQuery(workspaceStatusesQueryOptions(containerIds))
  // Ver el comentario equivalente en calendario.tsx: `tasksPending` solo
  // cuenta mientras SÍ hay containerIds (la query queda deshabilitada, y
  // por lo tanto "pending" para siempre, si el workspace no tiene
  // proyectos).
  const pending = projectsPending || (containerIds.length > 0 && tasksPending)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredByFacets = applyTaskFilters(tasks ?? [], search)
  const filteredTasks = searchQuery
    ? filteredByFacets.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredByFacets

  return (
    <div className="p-6 pb-16">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-accent-soft text-accent">
          <HugeiconsIcon icon={Table01Icon} className="size-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">Tabla</h1>
          <p className="text-xs text-text-muted">Todas las listas a la vez, cada una con su color.</p>
        </div>
      </div>

      {workspaceId && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterBar
            workspaceId={workspaceId}
            filters={search}
            onChange={(next) => navigate({ search: (prev) => ({ ...prev, ...next }) })}
          />
          <SearchPopover query={searchQuery} onQueryChange={setSearchQuery} />
        </div>
      )}

      {pending ? (
        <ListSkeleton />
      ) : (
        <GlobalTableView tasks={filteredTasks} statuses={statuses ?? []} projectsById={projectsById} />
      )}
    </div>
  )
}
