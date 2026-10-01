import { useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  FilterRemoveIcon,
  InboxIcon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProject, useStatuses, type StatusSummary } from '@/features/projects/queries'
import { ProjectPageHeader } from '@/features/projects/components/ProjectPageHeader'
import { hasActiveTaskFilters } from '@/features/projects/components/FilterBar'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useCreateTaskMutation, useSetTaskPriorityMutation } from '@/features/tasks/mutations'
import { TaskRow, type ExtraColumnValue } from '@/features/tasks/components/TaskRow'
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
import { useSubtaskCounts, useTasks, type TaskSummary } from '@/features/tasks/queries'
import { useListFieldVisibility } from '@/features/nodes/list-fields'
import { extraColumnsGridTemplate, LIST_ROW_GRID_NARROW, LIST_ROW_GRID_WIDE } from '@/features/tasks/components/list-row-grid'
import { useListExtraColumns, toggleListExtraColumn } from '@/features/nodes/list-extra-columns'
import { useProjectCustomFields, useProjectTaskCustomFieldValues } from '@/features/custom-fields/queries'
import { useSetAnyTaskCustomFieldValueMutation } from '@/features/custom-fields/mutations'
import type { Json } from '@/features/nodes/types'
import { ListSkeleton } from '@/features/projects/components/ProjectViewSkeleton'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/p/$projectId/list')({
  validateSearch: parseTaskFiltersSearch,
  component: ListPage,
})

function ListPage() {
  const { projectId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: project } = useProject(projectId)
  const { data: statuses, isPending: statusesPending } = useStatuses(projectId)
  const { workspaceId } = useCurrentWorkspace()
  const createTaskMutation = useCreateTaskMutation(projectId)
  const { filters, onFiltersChange, searchQuery, onSearchQueryChange } = useProjectViewSearch(search, navigate)

  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]

  const [assignOpen, setAssignOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const sectionInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const fieldVisibility = useListFieldVisibility(projectId)
  // Sin drag-and-drop en Lista (TaskRow no es arrastrable) — a diferencia
  // de board.tsx, acá Tipo de tarea solo se fija al CREAR (isMilestone en
  // la propia llamada), nunca hace falta una mutación de "mover" aparte.
  const setPriorityMutation = useSetTaskPriorityMutation(projectId)
  const setCustomFieldMutation = useSetAnyTaskCustomFieldValueMutation(projectId)

  const groupBy = decodeGroupBy(filters.groupBy)

  // Mismo criterio que board.tsx: query deduplicada con la que ya hace
  // useNodeViewController por dentro (mismo queryKey, mismo
  // includeDescription) — hace falta acá afuera para tener los ids de
  // tarea antes de armar `ctx.customFieldValuesByTask`.
  const { data: allTasksRaw } = useTasks(projectId, { includeDescription: fieldVisibility.description })
  const { data: customFieldDefs } = useProjectCustomFields(projectId)
  const selectedField =
    groupBy.kind === 'customField' ? customFieldDefs?.find((f) => f.id === groupBy.field) : undefined
  // "+ Añadir" del encabezado (ListHeaderRow, F-13): campos personalizados
  // elegidos a mano como columna extra — preferencia de vista persistida
  // en localStorage (list-extra-columns.ts), no un dato del proyecto.
  const extraColumnFieldIds = useListExtraColumns(projectId)
  const extraColumnFields = useMemo(
    () => (customFieldDefs ?? []).filter((f) => extraColumnFieldIds.includes(f.id)),
    [customFieldDefs, extraColumnFieldIds],
  )
  const hasExtraColumns = extraColumnFields.length > 0
  // Misma consulta en bloque que ya usaba solo Agrupar-por-campo-personalizado,
  // ampliada: también hace falta cuando hay columnas extra activas (trae los
  // valores de TODOS los campos para las tareas visibles, filtrados por
  // campo más abajo según haga falta cada caso).
  const needsCustomFieldValues = groupBy.kind === 'customField' || hasExtraColumns
  const allTaskIds = useMemo(
    () => (needsCustomFieldValues ? (allTasksRaw ?? []).map((t) => t.id) : []),
    [needsCustomFieldValues, allTasksRaw],
  )
  const { data: customFieldValueRows } = useProjectTaskCustomFieldValues(projectId, allTaskIds)
  const customFieldValuesByTask = useMemo(() => {
    const map = new Map<string, Json>()
    if (!selectedField) return map
    for (const row of customFieldValueRows ?? []) {
      if (row.field_id === selectedField.id) map.set(row.node_id, row.value)
    }
    return map
  }, [customFieldValueRows, selectedField])
  // Por tarea, un valor resuelto por cada columna extra elegida — mapa
  // `node_id:field_id` primero para no recorrer customFieldValueRows una
  // vez por cada combinación tarea×campo (cuadrático innecesario).
  const extraColumnsByTask = useMemo(() => {
    const map = new Map<string, ExtraColumnValue[]>()
    if (!hasExtraColumns) return map
    const valueByKey = new Map<string, Json>()
    for (const row of customFieldValueRows ?? []) {
      valueByKey.set(`${row.node_id}:${row.field_id}`, row.value)
    }
    for (const task of allTasksRaw ?? []) {
      map.set(
        task.id,
        extraColumnFields.map((field) => ({ field, value: valueByKey.get(`${task.id}:${field.id}`) })),
      )
    }
    return map
  }, [hasExtraColumns, extraColumnFields, allTasksRaw, customFieldValueRows])

  const { tasks, filteredTasks, groups, selection } = useNodeViewController(
    projectId,
    filters,
    { groupBy, includeDescription: fieldVisibility.description, sort: filters.sort, searchQuery },
    {
      // Keyeado por `groups[].key` (ver abajo), no por status_id — mismo
      // motivo que board.tsx.
      onFocusCreateInput: (groupKey) => {
        if (groupKey) sectionInputRefs.current[groupKey]?.focus()
      },
      onAssignOpen: () => setAssignOpen(true),
      onDateOpen: () => setDateOpen(true),
    },
    { statuses, customField: selectedField, customFieldValuesByTask },
  )

  // Toggle de subtareas inline (F-13, criterio ClickUp): un solo round-trip
  // por página para saber qué tareas siquiera TIENEN subtareas (así decide
  // si dibuja el chevron) — las subtareas de verdad recién se piden fila
  // por fila al expandir (ver TaskRow.tsx). Sobre `filteredTasks` (lo que
  // realmente se renderiza), no `tasks` (sin filtrar).
  const filteredTaskIds = useMemo(() => filteredTasks.map((t) => t.id), [filteredTasks])
  const { data: subtaskCounts } = useSubtaskCounts(filteredTaskIds)

  // Crear una tarea desde una sección agrupada por Prioridad/Persona
  // asignada/Tipo de tarea/campo personalizado — mismo criterio que
  // board.tsx: toda tarea necesita un status_id (se usa el default del
  // proyecto) y, si corresponde, se fija además el valor del campo
  // agrupado para que la tarea aterrice en esa sección. Persona asignada
  // se fija en la propia llamada de creación (D2/A2: "soltar la tarjeta
  // en su columna ya fue la asignación") — ver el comentario largo en
  // board.tsx (createTaskInGroup) para el resto de los detalles
  // (Etiquetas/Fecha límite sin preset, etc.).
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

  // Distingue "el proyecto no tiene ninguna tarea" de "el filtro/búsqueda
  // dejó todo afuera" (F-02) — antes las cinco secciones se mostraban con
  // el contador en 0 y ni una palabra sobre el filtro, indistinguible de
  // un proyecto realmente vacío.
  const isFilteredEmpty = tasks.length > 0 && filteredTasks.length === 0

  function toggleSection(statusId: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(statusId)) next.delete(statusId)
      else next.add(statusId)
      return next
    })
  }

  return (
    // Reportado por el usuario con una captura real: sin techo, la fila
    // se estira al ancho completo de un monitor grande, y ninguna
    // columna de metadata (angosta a propósito, mismo criterio ClickUp)
    // llena eso — quedaba "sin usar todo su espacio", con un vacío
    // enorme a la derecha en vez del margen que se buscaba. Mismo techo
    // que ya usa NodeDetailContent.tsx en modo página completa, mismo
    // motivo: una columna angosta de datos no debe estirarse a lo ancho
    // de toda la pantalla solo porque el monitor es grande.
    <div className="mx-auto w-full max-w-[1400px] p-6 pb-16">
      <ProjectPageHeader
        projectId={projectId}
        workspaceId={workspaceId}
        projectName={project?.name}
        showDensityToggle={false}
        showFieldVisibilityToggles
        toolbar={
          <ProjectToolbar
            projectId={projectId}
            workspaceId={workspaceId}
            filters={filters}
            onFiltersChange={onFiltersChange}
            searchQuery={searchQuery}
            onSearchQueryChange={onSearchQueryChange}
            createStatusId={defaultStatus?.id}
            showViewSettings
            exportTasks={filteredTasks}
            exportStatuses={statuses}
            projectName={project?.name}
            groupBy={filters.groupBy}
            onGroupByChange={(v) => onFiltersChange({ ...filters, groupBy: v })}
          />
        }
      />
      {/* `statusesPending` primero, no solo por estética: sin ese guard,
          mientras la query carga `statuses` es undefined y filteredTasks está
          vacío, así que la condición de abajo daba true y se mostraba "Sin
          tareas" un instante ANTES de saber si había tareas — un estado vacío
          falso en cada carga de la vista. */}
      {statusesPending ? (
        <ListSkeleton />
      ) : isFilteredEmpty ? (
        <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-10 text-center">
          <HugeiconsIcon icon={InboxIcon} className="size-5 text-text-muted/60" />
          <p className="text-sm text-text-muted">
            Ninguna de las {tasks.length} tarea{tasks.length === 1 ? '' : 's'} coincide con los filtros.
          </p>
          {(hasActiveTaskFilters(filters) || searchQuery) && (
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
          )}
        </div>
      ) : filteredTasks.length === 0 && (statuses?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-10 text-center">
          <HugeiconsIcon icon={InboxIcon} className="size-5 text-text-muted/60" />
          <p className="text-sm text-text-muted">
            Sin tareas. <CreateHint />
          </p>
        </div>
      ) : (
        // gap-1 (4px) hacía que las secciones se sintieran apiladas una
        // encima de otra, casi sin aire — mismo gap-4 que ya separa las
        // columnas del Board, para que las dos vistas respiren parecido.
        // Reportado por el usuario ("ahora está muy apretado").
        <div className="flex flex-col gap-4 overflow-x-auto">
          {groups.map((group) => (
            <ListSection
              key={group.key}
              group={group}
              groupBy={groupBy}
              allTasks={tasks}
              projectId={projectId}
              statuses={statuses ?? []}
              selectedIds={selection.selectedIds}
              collapsed={collapsedSections.has(group.key)}
              onToggle={() => toggleSection(group.key)}
              onCreateTask={(title) => createTaskInGroup(group.key, title)}
              inputRef={(el) => {
                sectionInputRefs.current[group.key] = el
              }}
              subtaskCounts={subtaskCounts}
              extraColumnsByTask={extraColumnsByTask}
            />
          ))}
        </div>
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

// Mismas dos constantes de grid que TaskRow.tsx (list-row-grid.ts) — así
// los rótulos quedan alineados de verdad con su columna de dato, no solo
// aproximados. Mismo orden Asignado/Fecha/Prioridad/Estado que la fila
// (criterio tomado de una captura real de ClickUp). Repetido por sección
// (ClickUp también lo hace así, pedido explícito del usuario) en vez de
// una sola vez arriba de todo — con varios grupos largos, el encabezado
// quedaba fuera de vista mucho antes de llegar al final de la lista.
function ListHeaderRow({ projectId }: { projectId: string }) {
  const fieldVisibility = useListFieldVisibility(projectId)
  const extraColumnFieldIds = useListExtraColumns(projectId)
  const { data: customFieldDefs } = useProjectCustomFields(projectId)
  const extraColumnFields = (customFieldDefs ?? []).filter((f) => extraColumnFieldIds.includes(f.id))
  const hasExtraColumns = extraColumnFields.length > 0

  // Mismo criterio dual que TaskRow.tsx: sin columnas extra, clase
  // estática (responsive angosto/ancho real); con columnas extra, plantilla
  // armada en JS por `style` (un número variable de tracks no se puede
  // expresar como clase de Tailwind).
  const gridClassName = !hasExtraColumns && cn(LIST_ROW_GRID_NARROW, LIST_ROW_GRID_WIDE)
  const gridStyle = hasExtraColumns ? { gridTemplateColumns: extraColumnsGridTemplate(extraColumnFields.length) } : undefined
  const metaVisibility = hasExtraColumns ? 'flex' : 'hidden @min-[640px]:flex'

  // Plan de corrección de layout, ronda 2 (2026-09-24): bg-surface, no
  // bg-bg — <main> (AppShell.tsx, Corrección 3) ahora tiene su propio
  // fondo bg-surface; con bg-bg (el fondo de color más externo, detrás
  // del riel/panel) este encabezado se leía como una franja más oscura
  // al hacer scroll, no como parte del mismo fondo que tapa.
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 rounded-md bg-surface px-2 py-1.5">
      <div
        className={cn(
          'grid flex-1 items-center gap-3 font-mono text-[10px] font-medium tracking-wide text-text-muted uppercase',
          gridClassName,
        )}
        style={gridStyle}
      >
        <span aria-hidden="true" />
        <span>Tarea</span>
        {fieldVisibility.assignee && <span className={metaVisibility}>Asignado</span>}
        {fieldVisibility.dueDate && <span className={metaVisibility}>Fecha</span>}
        {fieldVisibility.priority && <span className={metaVisibility}>Prior.</span>}
        <span>Estado</span>
        {extraColumnFields.map((field) => (
          <span key={field.id} className="truncate">
            {field.name}
          </span>
        ))}
      </div>
      {/* "+ Añadir" (pedido explícito del usuario, criterio ClickUp): elegir
          campos personalizados del proyecto para mostrarlos como columna —
          preferencia de vista (list-extra-columns.ts), no un dato del
          proyecto. Fuera de la grilla (no es una columna de dato más), para
          no alterar el conteo de tracks que ya coincide 1 a 1 con TaskRow. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Agregar columna">
            <HugeiconsIcon icon={Add01Icon} className="size-3.5 text-text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(customFieldDefs ?? []).length === 0 ? (
            <div className="px-1.5 py-1 text-sm text-text-muted">Sin campos personalizados en este proyecto.</div>
          ) : (
            (customFieldDefs ?? []).map((field) => (
              <DropdownMenuCheckboxItem
                key={field.id}
                checked={extraColumnFieldIds.includes(field.id)}
                onCheckedChange={() => toggleListExtraColumn(projectId, field.id)}
              >
                {field.name}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// Genérica desde el "Agrupar por" — antes tomaba `status: StatusSummary`
// directo (único groupBy posible). El color/badge de cada `kind` sale de
// groupVisual() (useNodeViewController.ts) — misma función que usa
// BoardGroupColumn, para no repetir esa rama de `if`s dos veces.
function ListSection({
  group,
  groupBy,
  allTasks,
  projectId,
  statuses,
  selectedIds,
  collapsed,
  onToggle,
  onCreateTask,
  inputRef,
  subtaskCounts,
  extraColumnsByTask,
}: {
  group: NodeGroup
  groupBy: ViewGroupBy
  allTasks: TaskSummary[]
  projectId: string
  statuses: StatusSummary[]
  selectedIds: Set<string>
  collapsed: boolean
  onToggle: () => void
  onCreateTask: (title: string) => void
  inputRef: (el: HTMLInputElement | null) => void
  subtaskCounts?: Record<string, number>
  extraColumnsByTask: Map<string, ExtraColumnValue[]>
}) {
  const [title, setTitle] = useState('')
  const tasks = group.tasks
  const visual = groupVisual(groupBy, group, statuses)

  return (
    // Sin tarjeta (antes: `rounded-card border ... shadow-card` envolviendo
    // cada sección) — auditoría de diseño, referencia ClickUp compartida
    // por el usuario: el límite entre grupos es 100% color (el pill de
    // abajo), no una caja. El `gap-4` que ya separa cada <ListSection> en
    // ListPage hace de límite entre grupos sin necesidad de un borde.
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-alt"
      >
        <HugeiconsIcon
          icon={collapsed ? ChevronRightIcon : ChevronDownIcon}
          className="size-3.5 shrink-0 text-text-muted"
        />
        {/* El pill lleva el nombre del grupo adentro, coloreado — antes
            era un dot chico + texto gris + un badge aparte solo con el
            número. Repetir el mismo color en un fondo de fila entera
            (probado y descartado) remarcaba el mismo dato dos veces; acá
            el color vive en un solo lugar. Agrupar por estado no trae
            `dotStyle` (el color sale de `badgeClassName`, ya pensado para
            ir en un pill); agrupar por etiqueta/campo personalizado sí
            —ahí el pill queda neutro y el color real va en el punto. */}
        <span className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', visual.badgeClassName)}>
          {visual.dotStyle && <span className="size-1.5 shrink-0 rounded-full" style={visual.dotStyle} />}
          {group.label}
        </span>
        <span className="font-mono text-xs text-text-muted tabular-nums">{tasks.length}</span>
      </button>

      {!collapsed && (
        <>
          {tasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <ListHeaderRow projectId={projectId} />
              <div className="flex flex-col divide-y divide-border border-t border-border">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectId={projectId}
                    statuses={statuses}
                    allTasks={allTasks}
                    selected={selectedIds.has(task.id)}
                    subtaskCount={subtaskCounts?.[task.id] ?? 0}
                    extraColumns={extraColumnsByTask.get(task.id) ?? []}
                  />
                ))}
              </div>
            </div>
          )}
          <form
            className="flex items-center gap-1.5 rounded-md px-3 has-[:focus-visible]:bg-bg"
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
              className="h-8 border-transparent bg-transparent px-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent"
            />
          </form>
        </>
      )}
    </div>
  )
}
