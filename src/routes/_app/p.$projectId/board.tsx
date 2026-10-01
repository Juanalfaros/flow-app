import { useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  closestCorners,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { HugeiconsIcon } from '@hugeicons/react'
import { FilterRemoveIcon, InboxIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { between, needsRebalance } from '@/lib/position'
import { useDragSensors } from '@/lib/drag-sensors'
import { useProject, useStatuses, type StatusSummary } from '@/features/projects/queries'
import { useReorderStatusesMutation } from '@/features/projects/mutations'
import { ProjectPageHeader } from '@/features/projects/components/ProjectPageHeader'
import { hasActiveTaskFilters } from '@/features/projects/components/FilterBar'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { tasksQueryOptions, useTasks, type TaskSummary } from '@/features/tasks/queries'
import {
  useCreateTaskMutation,
  useMoveTaskMutation,
  useRebalanceMutation,
  useSetTaskMilestoneMutation,
  useSetTaskPriorityMutation,
} from '@/features/tasks/mutations'
import { DraggableTaskCard } from '@/features/tasks/components/DraggableTaskCard'
import { TaskCard } from '@/features/tasks/components/TaskCard'
import { CreateHint } from '@/features/tasks/components/CreateHint'
import { SelectionActionBar } from '@/features/tasks/components/SelectionActionBar'
import { ProjectToolbar } from '@/features/projects/components/ProjectToolbar'
import {
  useNodeViewController,
  decodeGroupBy,
  groupVisual,
  type NodeGroup,
  type ViewGroupBy,
} from '@/features/nodes/useNodeViewController'
import { parseTaskFiltersSearch, useProjectViewSearch } from '@/features/nodes/useProjectViewSearch'
import { STATUS_KIND_BADGE, STATUS_KIND_DOT } from '@/features/projects/status-kind'
import { useProjectCustomFields, useProjectTaskCustomFieldValues } from '@/features/custom-fields/queries'
import { useSetAnyTaskCustomFieldValueMutation } from '@/features/custom-fields/mutations'
import type { Json } from '@/features/nodes/types'
import { BoardSkeleton } from '@/features/projects/components/ProjectViewSkeleton'
import { cn } from '@/lib/utils'

const COLUMN_PREFIX = 'col-'

type ActiveDrag = { type: 'task'; task: TaskSummary } | { type: 'status'; name: string }

// Al arrastrar una columna, el droppable del cuerpo de la columna
// (`useDroppable({id: statusId})`, para soltar tareas) comparte el mismo
// rect que el sortable del header (`col-${statusId}`) — y ambos compiten
// contra las tarjetas de tarea individuales, más pequeñas y "más cerca"
// según closestCorners. Filtrar a solo los headers de columna antes de
// medir colisión es lo que hace confiable el reordenamiento.
const boardCollisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type === 'status') {
    const columnContainers = args.droppableContainers.filter((c) => String(c.id).startsWith(COLUMN_PREFIX))
    return closestCenter({ ...args, droppableContainers: columnContainers })
  }
  return closestCorners(args)
}

export const Route = createFileRoute('/_app/p/$projectId/board')({
  validateSearch: parseTaskFiltersSearch,
  component: BoardPage,
})

function BoardPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: project } = useProject(projectId)
  const { data: statuses, isPending: statusesPending } = useStatuses(projectId)
  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]
  const { workspaceId } = useCurrentWorkspace()
  const createTaskMutation = useCreateTaskMutation(projectId)
  const moveTaskMutation = useMoveTaskMutation(projectId)
  const rebalanceMutation = useRebalanceMutation(projectId)
  const reorderStatusesMutation = useReorderStatusesMutation(projectId)
  const setPriorityMutation = useSetTaskPriorityMutation(projectId)
  const setMilestoneMutation = useSetTaskMilestoneMutation(projectId)
  const setCustomFieldMutation = useSetAnyTaskCustomFieldValueMutation(projectId)
  const queryClient = useQueryClient()
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const { filters, onFiltersChange, searchQuery, onSearchQueryChange } = useProjectViewSearch(search, navigate)
  const columnInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const groupBy = decodeGroupBy(filters.groupBy)

  // Misma query que ya hace useNodeViewController por dentro (mismo
  // queryKey vía tasksQueryOptions) — deduplicada por React Query, no es
  // un fetch extra. Hace falta ACÁ AFUERA para tener los ids de tarea
  // disponibles antes de armar `ctx.customFieldValuesByTask` (ver abajo),
  // que el propio hook necesita para agrupar.
  const { data: allTasksRaw } = useTasks(projectId)
  const { data: customFieldDefs } = useProjectCustomFields(projectId)
  const selectedField =
    groupBy.kind === 'customField' ? customFieldDefs?.find((f) => f.id === groupBy.field) : undefined

  // Solo se piden los valores cuando de verdad se agrupa por un campo
  // personalizado — `taskIds: []` deja la query deshabilitada el resto
  // del tiempo (ver projectTaskCustomFieldValuesQueryOptions).
  const customFieldTaskIds = useMemo(
    () => (groupBy.kind === 'customField' ? (allTasksRaw ?? []).map((t) => t.id) : []),
    [groupBy.kind, allTasksRaw],
  )
  const { data: customFieldValueRows } = useProjectTaskCustomFieldValues(projectId, customFieldTaskIds)
  const customFieldValuesByTask = useMemo(() => {
    const map = new Map<string, Json>()
    if (!selectedField) return map
    for (const row of customFieldValueRows ?? []) {
      if (row.field_id === selectedField.id) map.set(row.node_id, row.value)
    }
    return map
  }, [customFieldValueRows, selectedField])

  // El D&D de columnas de Estado (reordenar, colisiones) sigue iterando
  // `statuses` directo más abajo — solo alcanzable cuando groupBy.kind ===
  // 'status', el único modo con columnas arrastrables (ver el render).
  const { tasks, filteredTasks, groups, selection } = useNodeViewController(
    projectId,
    filters,
    { groupBy, sort: filters.sort, searchQuery },
    {
      // El input "Agregar tarea" de cada columna vive keyeado por
      // `groups[].key` (ver más abajo), no por status_id — el hook ya
      // resuelve cuál es el grupo correcto de la tarea activa.
      onFocusCreateInput: (groupKey) => {
        if (groupKey) columnInputRefs.current[groupKey]?.focus()
      },
      onAssignOpen: () => setAssignOpen(true),
      onDateOpen: () => setDateOpen(true),
    },
    { statuses, customField: selectedField, customFieldValuesByTask },
  )

  // Crear una tarea desde una columna agrupada por Prioridad/Persona
  // asignada/Tipo de tarea/campo personalizado: `create_task_node`
  // siempre exige un status_id (toda tarea tiene un estado, agrupar es
  // solo una forma de VERLAS) — se usa el estado default del proyecto, y
  // además se fija el valor del campo agrupado para que la tarea recién
  // creada de verdad aterrice en esa columna. Tipo de tarea y Persona
  // asignada se fijan en la propia llamada de creación
  // (`isMilestone`/`assigneeId`, que useCreateTaskMutation ya soporta) en
  // vez de una mutación aparte después: no hay motivo para un segundo
  // round-trip cuando el primero ya lo admite. "Sin valor"/"Sin asignar"
  // (`__none__`/`__unassigned__`) no presetean nada — no hay valor que
  // fijar. Tampoco Etiquetas/Fecha límite: una etiqueta no tiene "la"
  // columna obvia para una tarea nueva, y una fecha exacta no sale de un
  // balde ("Esta semana" son 7 días distintos) — se deja para que la
  // persona lo haga a mano.
  //
  // Persona asignada SÍ se fija (a diferencia de antes): decisión de
  // producto "Quién queda a cargo al crear" (D2, regla A2) — "soltar la
  // tarjeta en su columna ya fue la asignación". La objeción original
  // (agregar un responsable notifica y no tiene un "deshacer" tan simple
  // como mover una tarjeta) sigue siendo cierta, pero D2 la pesa contra
  // el costo de que las tarjetas de esta columna mientan sobre quién es
  // responsable, y resuelve a favor de asignar.
  function createTaskInGroup(groupKey: string, title: string) {
    if (groupBy.kind === 'status') {
      createTaskMutation.mutate({ title, statusId: groupKey })
      return
    }
    const statusId = defaultStatus?.id
    if (!statusId) return
    if (groupBy.kind === 'taskType') {
      createTaskMutation.mutate({ title, statusId, isMilestone: groupKey === 'milestone' })
      return
    }
    createTaskMutation.mutate(
      {
        title,
        statusId,
        assigneeId: groupBy.kind === 'assignee' && groupKey !== '__unassigned__' ? groupKey : undefined,
      },
      {
        onSuccess: (created) => {
          if (groupBy.kind === 'priority' && groupKey !== '__none__') {
            setPriorityMutation.mutate({ taskId: created.id, priority: groupKey })
          } else if (groupBy.kind === 'customField' && selectedField && groupKey !== '__none__') {
            setCustomFieldMutation.mutate({ taskId: created.id, fieldId: selectedField.id, value: groupKey })
          }
        },
      },
    )
  }

  // Grupo actual de una tarea para los modos SIN columnas arrastrables
  // (Prioridad/Tipo de tarea/campo personalizado) — resuelve a qué columna
  // pertenece hoy cuando se suelta sobre otra tarjeta (`overTask`, ver
  // handleDragEnd), igual que `overTask.status_id` en modo Estado. El
  // fallback (Persona asignada/Etiquetas/Fecha límite) nunca se ejecuta en
  // la práctica — esos modos no tienen drag habilitado (ver
  // BoardGroupColumn), pero la función necesita devolver algo para que el
  // tipo cierre.
  function currentGroupKeyOf(task: TaskSummary): string {
    if (groupBy.kind === 'priority') return task.priority
    if (groupBy.kind === 'taskType') return task.is_milestone ? 'milestone' : 'task'
    if (groupBy.kind === 'customField') {
      const value = customFieldValuesByTask.get(task.id)
      return typeof value === 'string' ? value : '__none__'
    }
    return task.status_id ?? ''
  }

  // F-02: distingue "el tablero no tiene ninguna tarea" de "el filtro/
  // búsqueda dejó todas las columnas en 0" — antes cada columna repetía
  // "Sin tareas. Presiona C para crear una.", que es mentira cuando en
  // realidad están filtradas, no ausentes.
  const isFilteredEmpty = tasks.length > 0 && filteredTasks.length === 0
  const isFiltered = hasActiveTaskFilters(filters) || !!searchQuery

  // KeyboardSensor con `sortableKeyboardCoordinates`: sin él, reordenar
  // tareas y columnas era imposible sin mouse. El coordinateGetter de
  // sortable salta de ítem a ítem en vez de mover 25px por pulsación (el
  // default de dnd-kit), que en un tablero de columnas no llega a nada útil.
  // Se activa desde el DragHandle de cada tarjeta y desde el header de
  // columna (que ya spreadea `attributes`). TouchSensor (ver
  // useDragSensors): antes deslizar para scrollear una columna arrastraba
  // la tarjeta (R-01).
  const sensors = useDragSensors({ coordinateGetter: sortableKeyboardCoordinates })

  function handleDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === 'status') {
      const statusId = event.active.data.current.statusId as string
      const status = statuses?.find((s) => s.id === statusId)
      if (status) setActiveDrag({ type: 'status', name: status.name })
      return
    }
    const task = filteredTasks.find((t) => t.id === event.active.id)
    if (task) setActiveDrag({ type: 'task', task })
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDrag(null)
    if (!over) return

    if (active.data.current?.type === 'status') {
      if (active.id === over.id || !statuses) return
      const columnIds = statuses.map((s) => `${COLUMN_PREFIX}${s.id}`)
      const oldIndex = columnIds.indexOf(active.id as string)
      const overRaw = String(over.id)
      const overStatusId = overRaw.startsWith(COLUMN_PREFIX) ? overRaw.slice(COLUMN_PREFIX.length) : overRaw
      const newIndex = statuses.findIndex((s) => s.id === overStatusId)
      if (oldIndex === -1 || newIndex === -1) return
      reorderStatusesMutation.mutate(arrayMove(statuses, oldIndex, newIndex).map((s) => s.id))
      return
    }

    const key = tasksQueryOptions(projectId).queryKey
    const currentTasks = queryClient.getQueryData<TaskSummary[]>(key) ?? []
    const activeTask = currentTasks.find((t) => t.id === active.id)
    if (!activeTask) return

    const overTask = currentTasks.find((t) => t.id === over.id)

    if (groupBy.kind !== 'status') {
      // Agrupado por algo distinto de Estado: sin columnas arrastrables
      // (ver render de abajo — solo Estado las tiene), así que `over`
      // siempre es otra tarjeta o el contenedor droppable (vacío o no) de
      // un grupo, nunca un header de columna. Solo Prioridad/Tipo de
      // tarea/campo personalizado mutan algo acá abajo — Persona asignada/
      // Etiquetas/Fecha límite llegan hasta acá (BoardGroupColumn no las
      // deja iniciar un drag, `draggable` es false) así que este bloque no
      // debería alcanzarse para esos tres en la práctica. Sin `position`
      // de por medio: a diferencia de status_id, ninguno de estos campos
      // tiene un orden propio a nivel de datos, así que la tarjeta
      // conserva la posición que ya tenía (mismo criterio documentado en
      // useSetTaskPriorityMutation).
      const targetGroupKey = overTask ? currentGroupKeyOf(overTask) : (over.id as string)
      if (currentGroupKeyOf(activeTask) === targetGroupKey) return

      if (groupBy.kind === 'priority') {
        setPriorityMutation.mutate({ taskId: activeTask.id, priority: targetGroupKey })
      } else if (groupBy.kind === 'taskType') {
        setMilestoneMutation.mutate({ taskId: activeTask.id, isMilestone: targetGroupKey === 'milestone' })
      } else if (groupBy.kind === 'customField' && selectedField) {
        setCustomFieldMutation.mutate({
          taskId: activeTask.id,
          fieldId: selectedField.id,
          value: targetGroupKey === '__none__' ? null : targetGroupKey,
        })
      }
      return
    }

    // over.id es un status.id cuando se suelta sobre el contenedor vacío
    // de la columna (droppable), o un task.id cuando se suelta sobre otra
    // tarjeta (sortable).
    const targetStatusId = overTask ? overTask.status_id : (over.id as string)
    if (!targetStatusId) return

    let siblings = currentTasks
      .filter((t) => t.status_id === targetStatusId && t.id !== activeTask.id)
      .sort((a, b) => a.position - b.position)

    const overIndex = overTask ? siblings.findIndex((t) => t.id === overTask.id) : siblings.length
    let prev = siblings[overIndex - 1]
    let next = siblings[overIndex]

    if (needsRebalance(prev?.position, next?.position)) {
      await rebalanceMutation.mutateAsync()
      // única otra excepción a "no invalidar": rebalance_positions
      // reescribe TODAS las filas de la columna con valores que el
      // cliente no puede predecir, así que se hace un fetch explícito.
      const fresh = await queryClient.fetchQuery(tasksQueryOptions(projectId))
      siblings = fresh
        .filter((t) => t.status_id === targetStatusId && t.id !== activeTask.id)
        .sort((a, b) => a.position - b.position)
      prev = siblings[overIndex - 1]
      next = siblings[overIndex]
    }

    const position = between(prev?.position, next?.position)
    moveTaskMutation.mutate({ taskId: activeTask.id, statusId: targetStatusId, position })
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
            exportTasks={filteredTasks}
            exportStatuses={statuses}
            projectName={project?.name}
            groupBy={filters.groupBy}
            onGroupByChange={(v) => onFiltersChange({ ...filters, groupBy: v })}
          />
        }
      />
      {/* Ternario (esqueleto o contenido), no `{statusesPending &&
          <BoardSkeleton />}` seguido del DndContext sin condición (B-11):
          con el `&&`, durante la carga el esqueleto se apilaba encima de
          un DndContext vacío, y al llegar los datos el esqueleto
          desaparecía y todo saltaba hacia arriba — mismo ternario que ya
          usa list.tsx. */}
      {statusesPending ? (
        <BoardSkeleton />
      ) : isFilteredEmpty ? (
        <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-10 text-center">
          <HugeiconsIcon icon={InboxIcon} className="size-5 text-text-muted/60" />
          <p className="text-sm text-text-muted">
            Ninguna de las {tasks.length} tarea{tasks.length === 1 ? '' : 's'} coincide con los filtros.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onFiltersChange({ ...filters, labelId: undefined, assigneeIds: undefined, priority: undefined })
              onSearchQueryChange('')
            }}
          >
            <HugeiconsIcon icon={FilterRemoveIcon} />
            Limpiar filtros
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* `@min-[640px]:snap-none`: snap-mandatory tiene sentido en
              móvil (una columna por pantalla), pero en un monitor con
              varias columnas visibles convertía el scroll horizontal en
              saltos que centran una columna a la fuerza (R-06) — mismo
              patrón que ya usa WeekView.tsx. */}
          {groupBy.kind === 'status' ? (
            <SortableContext
              items={(statuses ?? []).map((s) => `${COLUMN_PREFIX}${s.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="scroll-x-list flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-2 @min-[640px]:snap-none">
                {statuses?.map((status) => (
                  <BoardColumn
                    key={status.id}
                    projectId={projectId}
                    statusId={status.id}
                    statusName={status.name}
                    statusKind={status.status_kind}
                    tasks={filteredTasks.filter((t) => t.status_id === status.id)}
                    statuses={statuses ?? []}
                    // `tasks` (sin filtrar), no `filteredTasks` (B-10):
                    // toggleDone en TaskCard usa `allTasks` para calcular la
                    // última posición de la columna destino — con un filtro
                    // puesto, "la última" se calculaba contra una columna
                    // incompleta y la tarjeta aterrizaba en medio, no al
                    // final. Filtrar es una decisión de presentación, no debe
                    // alterar el cálculo de posición (List ya pasaba `tasks`
                    // sin filtrar, ver list.tsx).
                    allTasks={tasks}
                    selectedIds={selection.selectedIds}
                    isFiltered={isFiltered}
                    onCreateTask={(title) => createTaskInGroup(status.id, title)}
                    inputRef={(el) => {
                      columnInputRefs.current[status.id] = el
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          ) : (
            // Agrupado por Prioridad/Persona asignada/campo personalizado:
            // sin columnas arrastrables (no hay un "orden de columnas" que
            // guardar para ninguno de estos tres — a diferencia de Estado,
            // que sí tiene su propia posición en la tabla), así que no hay
            // SortableContext de columnas acá, solo el droppable de cada
            // una (adentro de BoardGroupColumn).
            <div className="scroll-x-list flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-2 @min-[640px]:snap-none">
              {groups.map((group) => (
                <BoardGroupColumn
                  key={group.key}
                  projectId={projectId}
                  group={group}
                  groupBy={groupBy}
                  statuses={statuses ?? []}
                  allTasks={tasks}
                  selectedIds={selection.selectedIds}
                  isFiltered={isFiltered}
                  onCreateTask={(title) => createTaskInGroup(group.key, title)}
                  inputRef={(el) => {
                    columnInputRefs.current[group.key] = el
                  }}
                />
              ))}
            </div>
          )}
          <DragOverlay>
            {activeDrag?.type === 'task' && (
              <div className="w-72 rotate-2 rounded-card opacity-90 shadow-lg">
                <TaskCard task={activeDrag.task} projectId={projectId} />
              </div>
            )}
            {activeDrag?.type === 'status' && (
              <div className="w-72 shrink-0 rounded-card border border-border bg-surface p-3 shadow-lg">
                <h2 className="text-xs font-semibold tracking-wide text-text-muted uppercase">{activeDrag.name}</h2>
              </div>
            )}
          </DragOverlay>
        </DndContext>
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

function BoardColumn({
  projectId,
  statusId,
  statusName,
  statusKind,
  tasks,
  statuses,
  allTasks,
  selectedIds,
  isFiltered,
  onCreateTask,
  inputRef,
}: {
  projectId: string
  statusId: string
  statusName: string
  statusKind: string
  tasks: TaskSummary[]
  statuses: StatusSummary[]
  allTasks: TaskSummary[]
  selectedIds: Set<string>
  isFiltered: boolean
  onCreateTask: (title: string) => void
  inputRef: (el: HTMLInputElement | null) => void
}) {
  const [title, setTitle] = useState('')
  const { setNodeRef: setDroppableRef } = useDroppable({ id: statusId })
  const {
    setNodeRef: setSortableRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${COLUMN_PREFIX}${statusId}`, data: { type: 'status', statusId } })

  return (
    <div
      ref={(el) => {
        setDroppableRef(el)
        setSortableRef(el)
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        // Plan de corrección de layout, ronda 2 (2026-09-24): sin
        // borde/sombra y con bg-surface-alt (no bg-surface, el mismo
        // color que <main>) — la columna es fondo, no una tarjeta más.
        // La tarjeta de tarea (TaskCard.tsx) es "el objeto" adentro:
        // bg-surface, con su propio borde/sombra, para que resalte contra
        // este fondo en vez de perderse en él.
        'w-[85vw] max-w-72 shrink-0 snap-center rounded-card bg-surface-alt p-3 sm:w-72',
        isDragging && 'opacity-40',
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="mb-3 flex min-w-0 cursor-grab touch-none items-center gap-1.5 active:cursor-grabbing"
      >
        <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_KIND_DOT[statusKind])} />
        <h2 className="truncate text-xs font-semibold tracking-wide text-text-muted uppercase">{statusName}</h2>
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
            STATUS_KIND_BADGE[statusKind],
          )}
        >
          {tasks.length}
        </span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {tasks.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-6 text-center">
              <HugeiconsIcon icon={InboxIcon} className="size-5 text-text-muted/60" />
              {/* Con un filtro/búsqueda activo, "Presiona C para crear una"
                  es mentira: sí hay tareas, están filtradas — el mensaje
                  correcto ya se muestra una sola vez arriba del tablero
                  (ver `isFilteredEmpty` en BoardPage), acá basta con no
                  repetir la invitación a crear. */}
              <p className="text-xs text-text-muted">
                {isFiltered ? (
                  'Sin coincidencias.'
                ) : (
                  <>
                    Sin tareas.
                    <br />
                    <CreateHint />
                  </>
                )}
              </p>
            </div>
          )}
          {tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              task={task}
              projectId={projectId}
              selected={selectedIds.has(task.id)}
              statuses={statuses}
              allTasks={allTasks}
            />
          ))}
        </div>
      </SortableContext>
      <form
        className="mt-2 flex items-center gap-1.5 rounded-md px-2 has-[:focus-visible]:bg-bg"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          onCreateTask(title.trim())
          setTitle('')
        }}
      >
        <HugeiconsIcon icon={PlusSignIcon} className="size-3.5 shrink-0 text-text-muted" />
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Agregar tarea"
          className="h-7 border-transparent bg-transparent px-0 text-xs shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent"
        />
      </form>
    </div>
  )
}

function EmptyColumnHint({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-6 text-center">
      <HugeiconsIcon icon={InboxIcon} className="size-5 text-text-muted/60" />
      <p className="text-xs text-text-muted">
        {isFiltered ? (
          'Sin coincidencias.'
        ) : (
          <>
            Sin tareas.
            <br />
            <CreateHint />
          </>
        )}
      </p>
    </div>
  )
}

// Columna genérica para "Agrupar por" Persona asignada/Prioridad/
// Etiquetas/Fecha límite/Tipo de tarea/campo personalizado — BoardColumn
// (arriba) sigue siendo la de Estado, con su propio drag-and-drop de
// columnas y su lógica de posición ya probada; se deja intacta en vez de
// generalizarla, para no arriesgar esa ruta. Prioridad/Tipo de tarea/campo
// personalizado son los únicos con drag habilitado: los otros tres
// (Persona asignada/Etiquetas — multivaluados, "sacarla de esta columna"
// no tiene un significado único — y Fecha límite — un balde como "Esta
// semana" no dice a qué día exacto mover la tarea) se muestran de solo
// lectura.
const DRAGGABLE_GROUP_KINDS: ViewGroupBy['kind'][] = ['priority', 'taskType', 'customField']

function BoardGroupColumn({
  projectId,
  group,
  groupBy,
  statuses,
  allTasks,
  selectedIds,
  isFiltered,
  onCreateTask,
  inputRef,
}: {
  projectId: string
  group: NodeGroup
  groupBy: ViewGroupBy
  statuses: StatusSummary[]
  allTasks: TaskSummary[]
  selectedIds: Set<string>
  isFiltered: boolean
  onCreateTask: (title: string) => void
  inputRef: (el: HTMLInputElement | null) => void
}) {
  const [title, setTitle] = useState('')
  const draggable = DRAGGABLE_GROUP_KINDS.includes(groupBy.kind)
  const { setNodeRef: setDroppableRef } = useDroppable({ id: group.key, disabled: !draggable })
  const visual = groupVisual(groupBy, group, statuses)

  return (
    <div
      ref={draggable ? setDroppableRef : undefined}
      // Plan de corrección de layout, ronda 2 (2026-09-24): mismo criterio
      // que BoardColumn arriba — la columna es fondo (bg-surface-alt, sin
      // borde ni sombra), no una tarjeta.
      className="w-[85vw] max-w-72 shrink-0 snap-center rounded-card bg-surface-alt p-3 sm:w-72"
    >
      <div className="mb-3 flex min-w-0 items-center gap-1.5">
        <span
          className={cn('size-1.5 shrink-0 rounded-full', !visual.dotStyle && visual.dotClassName)}
          style={visual.dotStyle}
        />
        <h2 className="truncate text-xs font-semibold tracking-wide text-text-muted uppercase">{group.label}</h2>
        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums', visual.badgeClassName)}>
          {group.tasks.length}
        </span>
      </div>
      {draggable ? (
        <SortableContext items={group.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {group.tasks.length === 0 && <EmptyColumnHint isFiltered={isFiltered} />}
            {group.tasks.map((task) => (
              <DraggableTaskCard
                key={task.id}
                task={task}
                projectId={projectId}
                selected={selectedIds.has(task.id)}
                statuses={statuses}
                allTasks={allTasks}
              />
            ))}
          </div>
        </SortableContext>
      ) : (
        <div className="flex flex-col gap-2">
          {group.tasks.length === 0 && <EmptyColumnHint isFiltered={isFiltered} />}
          {group.tasks.map((task) => (
            // `statuses`/`allTasks`: sin ellos TaskCard no puede resolver
            // `isDone` (son opcionales ahí solo para el DragOverlay, que
            // renderiza una tarjeta "de vista" sin necesitar que el check
            // sea interactivo) — faltaban acá, así que el check de
            // completar y el tachado del título desaparecían en todo
            // grupo de solo lectura (Persona asignada/Etiquetas/Fecha
            // límite). Reportado por el usuario.
            <TaskCard key={task.id} task={task} projectId={projectId} statuses={statuses} allTasks={allTasks} />
          ))}
        </div>
      )}
      <form
        className="mt-2 flex items-center gap-1.5 rounded-md px-2 has-[:focus-visible]:bg-bg"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          onCreateTask(title.trim())
          setTitle('')
        }}
      >
        <HugeiconsIcon icon={PlusSignIcon} className="size-3.5 shrink-0 text-text-muted" />
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Agregar tarea"
          className="h-7 border-transparent bg-transparent px-0 text-xs shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent"
        />
      </form>
    </div>
  )
}
