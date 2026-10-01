import { createFileRoute } from '@tanstack/react-router'
import { useProject, useStatuses } from '@/features/projects/queries'
import { ProjectPageHeader } from '@/features/projects/components/ProjectPageHeader'
import { applyTaskFilters } from '@/features/projects/components/FilterBar'
import { ProjectToolbar } from '@/features/projects/components/ProjectToolbar'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useTasks } from '@/features/tasks/queries'
import { GanttChart } from '@/features/gantt/components/GanttChart'
import { parseTaskFiltersSearch, useProjectViewSearch } from '@/features/nodes/useProjectViewSearch'
import { GanttSkeleton } from '@/features/projects/components/ProjectViewSkeleton'

export const Route = createFileRoute('/_app/p/$projectId/gantt')({
  validateSearch: parseTaskFiltersSearch,
  component: GanttPage,
})

function GanttPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: project } = useProject(projectId)
  const { data: statuses, isPending: statusesPending } = useStatuses(projectId)
  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]
  const { workspaceId } = useCurrentWorkspace()
  const { data: tasks } = useTasks(projectId)
  const { filters, onFiltersChange, searchQuery, onSearchQueryChange } = useProjectViewSearch(search, navigate)

  const filteredByFacets = applyTaskFilters(tasks ?? [], filters)
  const filteredTasks = searchQuery
    ? filteredByFacets.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredByFacets

  return (
    <div className="p-6 pb-16">
      <ProjectPageHeader
        projectId={projectId}
        workspaceId={workspaceId}
        projectName={project?.name}
        showDensityToggle={false}
        toolbar={
          <ProjectToolbar
            projectId={projectId}
            workspaceId={workspaceId}
            filters={filters}
            onFiltersChange={onFiltersChange}
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            createStatusId={defaultStatus?.id}
          />
        }
      />
      {statusesPending ? <GanttSkeleton /> : <GanttChart projectId={projectId} tasks={filteredTasks} statuses={statuses ?? []} />}
    </div>
  )
}
