import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useProject, useStatuses } from '@/features/projects/queries'
import { ProjectPageHeader } from '@/features/projects/components/ProjectPageHeader'
import { ProjectToolbar } from '@/features/projects/components/ProjectToolbar'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useNodeViewController } from '@/features/nodes/useNodeViewController'
import { parseTaskFiltersSearch, useProjectViewSearch } from '@/features/nodes/useProjectViewSearch'
import { TableView } from '@/features/tasks/components/TableView'
import { SelectionActionBar } from '@/features/tasks/components/SelectionActionBar'
import { ListSkeleton } from '@/features/projects/components/ProjectViewSkeleton'

export const Route = createFileRoute('/_app/p/$projectId/table')({
  validateSearch: parseTaskFiltersSearch,
  component: TablePage,
})

function TablePage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: project } = useProject(projectId)
  const { data: statuses, isPending: statusesPending } = useStatuses(projectId)
  const { workspaceId } = useCurrentWorkspace()
  const { filters, onFiltersChange, searchQuery, onSearchQueryChange } = useProjectViewSearch(search, navigate)

  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]

  const [assignOpen, setAssignOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)

  // groupBy: 'status' es boilerplate del hook (siempre requerido) — la
  // grilla no agrupa en secciones como list.tsx, así que `groups` del
  // resultado no se usa acá, solo `filteredTasks`/`selection`. Sin fila de
  // creación inline (a diferencia de board/list, que sí la tienen por
  // columna/sección), `onFocusCreateInput` no tiene a dónde enfocar — la
  // creación pasa por CreateTaskButton en el toolbar, como siempre.
  const { filteredTasks, selection } = useNodeViewController(
    projectId,
    filters,
    { groupBy: { kind: 'status' }, sort: filters.sort, searchQuery },
    {
      onFocusCreateInput: () => {},
      onAssignOpen: () => setAssignOpen(true),
      onDateOpen: () => setDateOpen(true),
    },
    { statuses },
  )

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
            exportTasks={filteredTasks}
            exportStatuses={statuses}
            projectName={project?.name}
          />
        }
      />
      {statusesPending ? (
        <ListSkeleton />
      ) : (
        <TableView
          projectId={projectId}
          tasks={filteredTasks}
          statuses={statuses ?? []}
          selectedIds={selection.selectedIds}
        />
      )}
      <SelectionActionBar
        projectId={projectId}
        workspaceId={workspaceId}
        selectedIds={selection.selectedIds}
        onClear={selection.clear}
        assignOpen={assignOpen}
        onAssignOpenChange={setAssignOpen}
        dateOpen={dateOpen}
        onDateOpenChange={setDateOpen}
      />
    </div>
  )
}
