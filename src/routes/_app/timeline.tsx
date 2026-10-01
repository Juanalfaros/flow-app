import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { RoadIcon } from '@hugeicons/core-free-icons'
import { applyTaskFilters, FilterBar, type TaskFilters } from '@/features/projects/components/FilterBar'
import { SearchPopover } from '@/features/projects/components/SearchPopover'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useProjects, workspaceStatusesQueryOptions } from '@/features/projects/queries'
import { subtreeTasksQueryOptions, useSubtreeTasks } from '@/features/tasks/queries'
import { GanttChart } from '@/features/gantt/components/GanttChart'
import { TASK_SORTS } from '@/features/nodes/useNodeViewController'
import { GanttSkeleton } from '@/features/projects/components/ProjectViewSkeleton'

export const Route = createFileRoute('/_app/timeline')({
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
  component: GlobalTimelinePage,
})

// S-06: versión "de todos los proyectos a la vez" de gantt.tsx — mismo
// GanttChart tal cual, alimentado por useSubtreeTasks + statuses de todo
// el workspace (workspaceStatusesQueryOptions, ya usada en f.$folderId.tsx
// para el mismo problema a nivel carpeta) en vez de un solo proyecto.
function GlobalTimelinePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { workspaceId } = useCurrentWorkspace()
  const { data: projects, isPending: projectsPending } = useProjects(workspaceId ?? '')
  const containerIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])
  const { data: tasks, isPending: tasksPending } = useSubtreeTasks(containerIds)
  const { data: statuses } = useQuery(workspaceStatusesQueryOptions(containerIds))
  // Antes el único guard era `containerIds.length > 0` — mientras cargaba
  // (containerIds todavía en `[]`) el GanttChart directo no se montaba,
  // indistinguible de "sin proyectos". Ver el comentario equivalente en
  // calendario.tsx sobre por qué `tasksPending` sola no alcanza.
  const pending = projectsPending || (containerIds.length > 0 && tasksPending)
  const [searchQuery, setSearchQuery] = useState('')
  const queryClient = useQueryClient()

  const filteredByFacets = applyTaskFilters(tasks ?? [], search)
  const filteredTasks = searchQuery
    ? filteredByFacets.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredByFacets

  return (
    <div className="p-6 pb-16">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-accent-soft text-accent">
          <HugeiconsIcon icon={RoadIcon} className="size-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">Timeline</h1>
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
        <GanttSkeleton />
      ) : (
        containerIds.length > 0 && (
          <GanttChart
            // Cualquier id sirve acá — GanttChart lo usa solo para el prefijo
            // de query key de useUpdateTaskScheduleMutation (bookkeeping de
            // cache de un solo proyecto), no para decidir a qué tarea le
            // pertenece qué: eso ya sale de task.container_id (GanttRow.tsx).
            // `onScheduleChanged` es lo que de verdad mantiene esta página al
            // día — invalida la query que la alimenta de verdad.
            projectId={containerIds[0] ?? ''}
            tasks={filteredTasks}
            statuses={statuses ?? []}
            onScheduleChanged={() =>
              queryClient.invalidateQueries({ queryKey: subtreeTasksQueryOptions(containerIds).queryKey })
            }
            showProjectColor
          />
        )
      )}
    </div>
  )
}
