import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { DndContext, DragOverlay, closestCenter, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useDragSensors } from '@/lib/drag-sensors'
import { useProject, useStatuses } from '@/features/projects/queries'
import { ProjectPageHeader } from '@/features/projects/components/ProjectPageHeader'
import { applyTaskFilters, type TaskFilters } from '@/features/projects/components/FilterBar'
import { ProjectToolbar } from '@/features/projects/components/ProjectToolbar'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useTasks, type TaskSummary } from '@/features/tasks/queries'
import { useCreateTaskMutation, useRescheduleTaskMutation } from '@/features/tasks/mutations'
import { CalendarToolbar } from '@/features/calendar/components/CalendarToolbar'
import { MonthView } from '@/features/calendar/components/MonthView'
import { WeekView } from '@/features/calendar/components/WeekView'
import { DayView } from '@/features/calendar/components/DayView'
import { fromDateKey, toDateKey, type CalendarRange } from '@/features/calendar/date-utils'
import { PRIORITY_DOT } from '@/features/tasks/priority'
import { parseTaskFiltersSearch, useProjectViewSearch } from '@/features/nodes/useProjectViewSearch'
import { CalendarSkeleton } from '@/features/projects/components/ProjectViewSkeleton'
import { cn } from '@/lib/utils'

type CalendarSearch = TaskFilters & { range?: CalendarRange; date?: string }

export const Route = createFileRoute('/_app/p/$projectId/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
    ...parseTaskFiltersSearch(search),
    range: search.range === 'day' || search.range === 'week' || search.range === 'month' ? search.range : undefined,
    date: typeof search.date === 'string' ? search.date : undefined,
  }),
  component: CalendarPage,
})

function CalendarPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: project } = useProject(projectId)
  const { data: statuses, isPending: statusesPending } = useStatuses(projectId)
  const { workspaceId } = useCurrentWorkspace()
  const { data: tasks } = useTasks(projectId)
  const createTaskMutation = useCreateTaskMutation(projectId)
  const rescheduleMutation = useRescheduleTaskMutation(projectId)
  const [activeDragTask, setActiveDragTask] = useState<TaskSummary | null>(null)
  const { filters, onFiltersChange, searchQuery, onSearchQueryChange } = useProjectViewSearch(search, navigate)

  const range = search.range ?? 'month'
  const anchorDate = search.date ? fromDateKey(search.date) : new Date()
  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]

  const filteredByFacets = applyTaskFilters(tasks ?? [], filters)
  const filteredTasks = searchQuery
    ? filteredByFacets.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredByFacets
  const tasksByDate = new Map<string, TaskSummary[]>()
  for (const task of filteredTasks) {
    if (!task.due_date) continue
    const list = tasksByDate.get(task.due_date)
    if (list) list.push(task)
    else tasksByDate.set(task.due_date, [task])
  }

  // Solo para MonthView (Semana/Día siguen usando `tasksByDate` sin
  // tocar, con chip de un día): las tareas con start_date≠due_date se
  // sacan de ahí y se pasan aparte para dibujarse como barra de rango en
  // vez de chip — antes el calendario nunca leía `start_date`, así que
  // esos 3-4 días de trabajo previo desaparecían y solo se veía el día
  // de entrega.
  const rangedTasks = filteredTasks.filter(
    (t): t is TaskSummary & { start_date: string; due_date: string } =>
      !!t.start_date && !!t.due_date && t.start_date !== t.due_date,
  )
  const monthTasksByDate = new Map<string, TaskSummary[]>()
  for (const task of filteredTasks) {
    if (!task.due_date) continue
    if (task.start_date && task.due_date && task.start_date !== task.due_date) continue
    const list = monthTasksByDate.get(task.due_date)
    if (list) list.push(task)
    else monthTasksByDate.set(task.due_date, [task])
  }

  // KeyboardSensor con el coordinateGetter default (25px por pulsación):
  // acá no hay lista sortable sino una grilla de días, así que el
  // desplazamiento libre es el comportamiento correcto — se activa desde el
  // DragHandle de cada CalendarTaskChip. TouchSensor (ver useDragSensors):
  // antes deslizar un chip para scrollear arrastraba la tarea (R-01).
  const sensors = useDragSensors()

  function handleDragStart(event: DragStartEvent) {
    const task = filteredTasks.find((t) => t.id === event.active.id)
    if (task) setActiveDragTask(task)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDragTask(null)
    if (!over) return
    const task = filteredTasks.find((t) => t.id === active.id)
    const dateKey = String(over.id)
    if (!task || task.due_date === dateKey) return
    rescheduleMutation.mutate({ taskId: task.id, dueDate: dateKey })
  }

  function handleCreateTask(dateKey: string, title: string) {
    if (!defaultStatus) return
    createTaskMutation.mutate({ title, statusId: defaultStatus.id, dueDate: dateKey })
  }

  function handleRangeChange(nextRange: CalendarRange) {
    navigate({ search: (prev) => ({ ...prev, range: nextRange }) })
  }

  function handleAnchorChange(nextDate: Date) {
    navigate({ search: (prev) => ({ ...prev, date: toDateKey(nextDate) }) })
  }

  function handleOpenDay(date: Date) {
    navigate({ search: (prev) => ({ ...prev, range: 'day', date: toDateKey(date) }) })
  }

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
      <CalendarToolbar
        range={range}
        anchorDate={anchorDate}
        onRangeChange={handleRangeChange}
        onAnchorChange={handleAnchorChange}
      />
      {/* Ternario, no `{statusesPending && <CalendarSkeleton />}` seguido
          del DndContext sin condición — mismo motivo B-11 que board.tsx. */}
      {statusesPending ? (
        <CalendarSkeleton />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {range === 'month' && (
            <MonthView
              anchorDate={anchorDate}
              tasksByDate={monthTasksByDate}
              rangedTasks={rangedTasks}
              onCreateTask={handleCreateTask}
              onOpenDay={handleOpenDay}
            />
          )}
          {range === 'week' && (
            <WeekView anchorDate={anchorDate} tasksByDate={tasksByDate} onCreateTask={handleCreateTask} />
          )}
          {range === 'day' && (
            <DayView anchorDate={anchorDate} tasksByDate={tasksByDate} onCreateTask={handleCreateTask} />
          )}
          <DragOverlay>
            {activeDragTask && (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-1 text-xs shadow-lg">
                <span className={cn('size-1.5 shrink-0 rounded-full', PRIORITY_DOT[activeDragTask.priority])} />
                <span className="truncate text-text">{activeDragTask.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
