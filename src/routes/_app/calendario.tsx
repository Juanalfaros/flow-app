import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { applyTaskFilters, FilterBar, type TaskFilters } from '@/features/projects/components/FilterBar'
import { SearchPopover } from '@/features/projects/components/SearchPopover'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useProjects } from '@/features/projects/queries'
import { subtreeTasksQueryOptions, useSubtreeTasks, type TaskSummary } from '@/features/tasks/queries'
import { updateTaskFields } from '@/features/tasks/api'
import { CalendarToolbar } from '@/features/calendar/components/CalendarToolbar'
import { MonthView } from '@/features/calendar/components/MonthView'
import { WeekView } from '@/features/calendar/components/WeekView'
import { DayView } from '@/features/calendar/components/DayView'
import { fromDateKey, toDateKey, type CalendarRange } from '@/features/calendar/date-utils'
import { PRIORITY_DOT } from '@/features/tasks/priority'
import { TASK_SORTS } from '@/features/nodes/useNodeViewController'
import { CalendarSkeleton } from '@/features/projects/components/ProjectViewSkeleton'
import { cn } from '@/lib/utils'

type CalendarSearch = TaskFilters & { range?: CalendarRange; date?: string }

export const Route = createFileRoute('/_app/calendario')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
    labelId: typeof search.labelId === 'string' ? search.labelId : undefined,
    assigneeIds: Array.isArray(search.assigneeIds)
      ? search.assigneeIds.filter((v): v is string => typeof v === 'string')
      : undefined,
    priority: typeof search.priority === 'string' ? search.priority : undefined,
    sort: TASK_SORTS.includes(search.sort as (typeof TASK_SORTS)[number])
      ? (search.sort as (typeof TASK_SORTS)[number])
      : undefined,
    range: search.range === 'day' || search.range === 'week' || search.range === 'month' ? search.range : undefined,
    date: typeof search.date === 'string' ? search.date : undefined,
  }),
  component: GlobalCalendarPage,
})

// S-06: versión "de todos los proyectos a la vez" de calendar.tsx — mismo
// MonthView/WeekView/DayView tal cual, alimentados por useSubtreeTasks en
// vez de useTasks(un solo proyecto). Sin ProjectPageHeader/ProjectToolbar
// (no hay un solo proyecto del que colgar "Nueva tarea" ni Estados/
// Etiquetas) — encabezado propio, más liviano. Tampoco hay "+" por día acá
// (ver MonthView.tsx: onCreateTask omitido): crear una tarea nueva necesita
// elegir a qué lista pertenece, y esta vista no tiene ese selector — para
// eso está el botón "+" de cada proyecto, esta vista es de consulta y
// reprogramar lo que ya existe.
function GlobalCalendarPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { workspaceId } = useCurrentWorkspace()
  const { data: projects, isPending: projectsPending } = useProjects(workspaceId ?? '')
  const containerIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])
  const { data: tasks, isPending: tasksPending } = useSubtreeTasks(containerIds)
  // `subtreeTasksQueryOptions` queda `enabled: containerIds.length > 0` —
  // si el workspace no tiene proyectos, esa query nunca corre y
  // `tasksPending` se queda en `true` para siempre; por eso solo cuenta
  // mientras SÍ hay containerIds. `projectsPending` cubre la carga previa
  // (patrón board.tsx/B-11: ternario, nunca `{pending && <Skeleton/>}`).
  const pending = projectsPending || (containerIds.length > 0 && tasksPending)
  const [activeDragTask, setActiveDragTask] = useState<TaskSummary | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const queryClient = useQueryClient()

  const range = search.range ?? 'month'
  const anchorDate = search.date ? fromDateKey(search.date) : new Date()

  // Reprogramar (mover una tarea a otro día) es la única escritura de esta
  // vista — un `updateTaskFields` directo, sin pasar por
  // useRescheduleTaskMutation(unSoloProjectId): esa mutación patchea el
  // cache de UN proyecto (tasksListKeyPrefix(containerId)), y acá las
  // tareas visibles son de varios a la vez. Se invalida directo la query
  // que de verdad alimenta esta página (subtreeTasksQueryOptions).
  const rescheduleMutation = useMutation({
    mutationFn: (vars: { taskId: string; dueDate: string }) => updateTaskFields(vars.taskId, { due_date: vars.dueDate }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subtreeTasksQueryOptions(containerIds).queryKey }),
    onError: () => toast.error('No se pudo reprogramar la tarea. Vuelve a intentarlo.'),
  })

  const filteredByFacets = applyTaskFilters(tasks ?? [], search)
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

  // Mismo criterio que calendar.tsx: tareas con start_date≠due_date se
  // sacan para dibujarse como barra de rango en vez de chip de un día.
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

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
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-accent-soft text-accent">
          <HugeiconsIcon icon={Calendar01Icon} className="size-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">Calendario</h1>
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

      <CalendarToolbar
        range={range}
        anchorDate={anchorDate}
        onRangeChange={handleRangeChange}
        onAnchorChange={handleAnchorChange}
      />
      {pending ? (
        <CalendarSkeleton />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {range === 'month' && (
            <MonthView
              anchorDate={anchorDate}
              tasksByDate={monthTasksByDate}
              rangedTasks={rangedTasks}
              onOpenDay={handleOpenDay}
              showProjectColor
            />
          )}
          {range === 'week' && <WeekView anchorDate={anchorDate} tasksByDate={tasksByDate} showProjectColor />}
          {range === 'day' && <DayView anchorDate={anchorDate} tasksByDate={tasksByDate} showProjectColor />}
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
