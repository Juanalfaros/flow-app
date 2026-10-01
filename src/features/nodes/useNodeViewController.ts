import { useEffect } from 'react'
import { addDays, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import { confirmWithUndo } from '@/lib/undo-toast'
import { applyTaskFilters, type TaskFilters } from '@/features/projects/components/FilterBar'
import type { StatusSummary } from '@/features/projects/queries'
import { STATUS_KIND_BADGE, STATUS_KIND_DOT } from '@/features/projects/status-kind'
import { useTasks, type TaskSummary } from '@/features/tasks/queries'
import { useBulkUpdateTasksMutation } from '@/features/tasks/mutations'
import { isTypingTarget, useTaskSelection } from '@/features/tasks/useTaskSelection'
import type { CustomFieldDefinition } from '@/features/custom-fields/queries'
import type { Json } from '@/features/nodes/types'
import { PRIORITY_BADGE, PRIORITY_DOT, PRIORITY_LABEL, PRIORITY_URGENCY_ORDER, type Priority } from '@/features/tasks/priority'

export type ViewGroupBy =
  | { kind: 'status' }
  | { kind: 'assignee' }
  | { kind: 'priority' }
  | { kind: 'label' }
  | { kind: 'dueDate' }
  | { kind: 'taskType' }
  | { kind: 'customField'; field: string }

// "Agrupar por" viaja en la URL como un solo string (mismo criterio que
// `sort` — ver TaskFilters/parseTaskFiltersSearch) para no multiplicar
// parámetros: la mayoría de los `kind` tal cual, un campo personalizado
// como `field:<id>`. Board/Lista comparten estas dos funciones vía
// GroupByPicker.tsx — un solo lugar donde el string y el objeto
// `ViewGroupBy` se traducen entre sí.
const CUSTOM_FIELD_PREFIX = 'field:'
const PLAIN_KINDS = ['assignee', 'priority', 'label', 'dueDate', 'taskType'] as const

export function encodeGroupBy(groupBy: ViewGroupBy): string {
  return groupBy.kind === 'customField' ? `${CUSTOM_FIELD_PREFIX}${groupBy.field}` : groupBy.kind
}

export function decodeGroupBy(value: string | undefined): ViewGroupBy {
  if (!value) return { kind: 'status' }
  if (value.startsWith(CUSTOM_FIELD_PREFIX)) return { kind: 'customField', field: value.slice(CUSTOM_FIELD_PREFIX.length) }
  if ((PLAIN_KINDS as readonly string[]).includes(value)) return { kind: value as (typeof PLAIN_KINDS)[number] }
  return { kind: 'status' }
}

export interface ViewConfig {
  groupBy: ViewGroupBy
  /** Solo vista Lista con el toggle de descripción prendido — ver
   * src/features/nodes/list-fields.ts. Default false: evita cargar HTML
   * potencialmente largo por tarea cuando nadie lo va a mostrar. */
  includeDescription?: boolean
  /** Orden del toolbar (ver TaskFilters.sort) — 'manual' u omitido deja el
   * orden que ya trae `tasks` (posición/drag). */
  sort?: TaskSort
  /** Búsqueda del toolbar — efímera, no viaja por la URL (ver ProjectToolbar). */
  searchQuery?: string
}

export const TASK_SORTS = ['manual', 'dueDate', 'priority', 'createdAt'] as const
export type TaskSort = (typeof TASK_SORTS)[number]

// Sin fecha va al final en 'dueDate' — una tarea sin vencimiento no es
// "más urgente" que una con fecha, es simplemente "sin definir".
export function sortTasks(tasks: TaskSummary[], sort: TaskSort | undefined): TaskSummary[] {
  if (!sort || sort === 'manual') return tasks
  const copy = [...tasks]
  if (sort === 'dueDate') {
    copy.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
  } else if (sort === 'priority') {
    copy.sort(
      (a, b) =>
        PRIORITY_URGENCY_ORDER.indexOf(a.priority as Priority) -
        PRIORITY_URGENCY_ORDER.indexOf(b.priority as Priority),
    )
  } else if (sort === 'createdAt') {
    copy.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return copy
}

export interface NodeGroup {
  key: string
  label: string
  tasks: TaskSummary[]
  /** Solo grupos de campo personalizado tipo `select` — color de la
   * opción, mismo shape que `project_custom_fields.options` (ver
   * custom-fields/queries.ts). El resto de los `kind` usan su propio
   * mapeo de color fijo en la UI (STATUS_KIND_DOT, PRIORITY_DOT). */
  color?: string | null
}

export interface GroupContext {
  statuses?: StatusSummary[]
  members?: { user_id: string; profile: { full_name: string | null } | null }[]
  /** Solo cuando `groupBy.kind === 'customField'` — la definición del
   * campo elegido (para sus opciones, orden y color) y los valores reales
   * de cada tarea, ya resueltos desde `task_custom_field_values` (NO el
   * jsonb legado `nodes.custom_fields`, reservado para apariencia del
   * nodo — ver getCustomFieldString/types.ts). Board/Lista arman este mapa
   * con `useProjectTaskCustomFieldValues`. */
  customField?: CustomFieldDefinition
  customFieldValuesByTask?: Map<string, Json>
}

// Función pura, exportada aparte de `useNodeViewController` para poder
// probarla en consola sin montar un hook. `status`/`priority`/
// `customField` (select) conservan sus grupos vacíos — son un conjunto
// fijo y chico de valores conocidos, así que una columna del Kanban existe
// aunque tenga 0 tareas (para poder arrastrar/crear ahí). `assignee` no:
// el universo de personas puede ser grande, así que solo se muestran las
// que de verdad tienen alguna tarea.
export function groupTasks(tasks: TaskSummary[], groupBy: ViewGroupBy, ctx: GroupContext = {}): NodeGroup[] {
  if (groupBy.kind === 'status') {
    return (ctx.statuses ?? []).map((status) => ({
      key: status.id,
      label: status.name,
      tasks: tasks.filter((t) => t.status_id === status.id),
    }))
  }

  if (groupBy.kind === 'priority') {
    return PRIORITY_URGENCY_ORDER.map((priority) => ({
      key: priority,
      // `?? priority`: PRIORITY_LABEL es un Record<string, string> (el enum de
      // prioridad vive como check constraint, no como tipo), así que indexarlo
      // no garantiza una etiqueta. Ante una prioridad nueva sin traducir, se
      // muestra la clave cruda en vez de un encabezado vacío.
      label: PRIORITY_LABEL[priority] ?? priority,
      tasks: tasks.filter((t) => t.priority === priority),
    }))
  }

  if (groupBy.kind === 'assignee') {
    // Una tarea con varios responsables (task_assignees, 0041) aparece en
    // más de un grupo — mismo comportamiento ya aceptado para "agrupar por
    // etiqueta" (una tarea con 2 etiquetas también aparecería en 2, si
    // hubiera un groupBy por label).
    const groups = new Map<string, NodeGroup>()
    const unassigned: NodeGroup = { key: '__unassigned__', label: 'Sin asignar', tasks: [] }
    for (const task of tasks) {
      if (task.task_assignees.length === 0) {
        unassigned.tasks.push(task)
        continue
      }
      for (const a of task.task_assignees) {
        const existing = groups.get(a.user_id)
        if (existing) {
          existing.tasks.push(task)
          continue
        }
        const member = ctx.members?.find((m) => m.user_id === a.user_id)
        groups.set(a.user_id, {
          key: a.user_id,
          label: member?.profile?.full_name ?? a.assignee?.full_name ?? 'Sin nombre',
          tasks: [task],
        })
      }
    }
    return [...groups.values(), unassigned].filter((g) => g.tasks.length > 0)
  }

  if (groupBy.kind === 'label') {
    // Mismo criterio que 'assignee': una tarea con varias etiquetas
    // aparece en más de un grupo, y solo se muestran las etiquetas que de
    // verdad tiene alguna tarea (el universo de etiquetas del workspace
    // puede ser grande).
    const groups = new Map<string, NodeGroup>()
    const none: NodeGroup = { key: '__none__', label: 'Sin etiquetas', tasks: [] }
    for (const task of tasks) {
      if (task.task_labels.length === 0) {
        none.tasks.push(task)
        continue
      }
      for (const tl of task.task_labels) {
        const existing = groups.get(tl.label.id)
        if (existing) {
          existing.tasks.push(task)
          continue
        }
        groups.set(tl.label.id, { key: tl.label.id, label: tl.label.name, color: tl.label.color, tasks: [task] })
      }
    }
    return [...groups.values(), none].filter((g) => g.tasks.length > 0)
  }

  if (groupBy.kind === 'dueDate') {
    // Baldes fijos (conservan los vacíos, igual que Estado/Prioridad) — no
    // hay drag habilitado para este `kind` (ver BoardGroupColumn): soltar
    // una tarjeta en "Esta semana" no dice a qué día exacto moverla, a
    // diferencia de Prioridad/campo personalizado, que sí son un valor
    // único. Mismos umbrales de "hoy"/"vencida" que formatDueDate
    // (lib/format-date.ts), sin reusar esa función porque acá hace falta
    // el balde entero, no solo overdue/today/future (3 valores, acá son 5).
    const overdue: NodeGroup = { key: 'overdue', label: 'Vencidas', tasks: [] }
    const today: NodeGroup = { key: 'today', label: 'Hoy', tasks: [] }
    const week: NodeGroup = { key: 'week', label: 'Esta semana', tasks: [] }
    const later: NodeGroup = { key: 'later', label: 'Más adelante', tasks: [] }
    const none: NodeGroup = { key: '__none__', label: 'Sin fecha', tasks: [] }
    const todayStart = startOfDay(new Date())
    const weekEnd = addDays(todayStart, 7)
    for (const task of tasks) {
      if (!task.due_date) {
        none.tasks.push(task)
        continue
      }
      const date = parseISO(task.due_date)
      if (isToday(date)) today.tasks.push(task)
      else if (isBefore(date, todayStart)) overdue.tasks.push(task)
      else if (isBefore(date, weekEnd)) week.tasks.push(task)
      else later.tasks.push(task)
    }
    return [overdue, today, week, later, none]
  }

  if (groupBy.kind === 'taskType') {
    // Los únicos 2 tipos con respaldo real en el schema (nodes.is_milestone
    // — ver CreateTaskButton.tsx, mismo criterio "Tarea"/"Hito" que su
    // dropdown). Conserva vacíos, igual que Prioridad/Estado.
    return [
      { key: 'task', label: 'Tarea', tasks: tasks.filter((t) => !t.is_milestone) },
      { key: 'milestone', label: 'Hito', tasks: tasks.filter((t) => t.is_milestone) },
    ]
  }

  // customField (select) — sin la definición del campo (todavía cargando,
  // o el campo elegido se borró) no hay opciones ni orden que mostrar: un
  // solo grupo con todo, mejor que reventar o mostrar 0 columnas.
  const field = ctx.customField
  if (!field || field.field_type !== 'select' || !field.options) {
    return [{ key: '__none__', label: 'Sin valor', tasks }]
  }
  const valuesByTask = ctx.customFieldValuesByTask
  const groups = new Map<string, NodeGroup>(
    field.options.map((opt) => [opt.id, { key: opt.id, label: opt.label, color: opt.color, tasks: [] }]),
  )
  const none: NodeGroup = { key: '__none__', label: 'Sin valor', tasks: [] }
  for (const task of tasks) {
    const raw = valuesByTask?.get(task.id)
    const optionId = typeof raw === 'string' ? raw : undefined
    const group = optionId ? groups.get(optionId) : undefined
    if (group) group.tasks.push(task)
    else none.tasks.push(task)
  }
  return [...groups.values(), none]
}

const DUE_DATE_DOT: Record<string, string> = {
  overdue: 'bg-danger',
  today: 'bg-accent',
  week: 'bg-accent-2',
  later: 'bg-text-muted',
  __none__: 'bg-text-muted',
}
const DUE_DATE_BADGE: Record<string, string> = {
  overdue: 'bg-danger/15 text-danger',
  today: 'bg-accent/15 text-accent',
  week: 'bg-accent-2/15 text-accent-2-hover',
  later: 'bg-surface-alt text-text-muted',
  __none__: 'bg-surface-alt text-text-muted',
}
const TASK_TYPE_DOT: Record<string, string> = { milestone: 'bg-accent-2', task: 'bg-text-muted' }
const TASK_TYPE_BADGE: Record<string, string> = {
  milestone: 'bg-accent-2/15 text-accent-2-hover',
  task: 'bg-surface-alt text-text-muted',
}
const NEUTRAL_BADGE = 'bg-surface-alt text-text-muted'

export interface GroupVisual {
  dotClassName: string
  dotStyle?: { backgroundColor: string }
  badgeClassName: string
}

// Color del punto/badge de cada grupo — Board (BoardGroupColumn) y Lista
// (ListSection) mostraban esta misma rama de `if`s duplicada dos veces;
// vive acá para no triplicarla en el próximo `kind` que se agregue. Estado
// necesita `statuses` (el color depende de `status_kind`, no vive en
// `group` directo) — el resto de los `kind` no.
export function groupVisual(groupBy: ViewGroupBy, group: NodeGroup, statuses: StatusSummary[] = []): GroupVisual {
  if (groupBy.kind === 'status') {
    const status = statuses.find((s) => s.id === group.key)
    return {
      dotClassName: status ? (STATUS_KIND_DOT[status.status_kind] ?? 'bg-text-muted') : 'bg-text-muted',
      badgeClassName: status ? (STATUS_KIND_BADGE[status.status_kind] ?? NEUTRAL_BADGE) : NEUTRAL_BADGE,
    }
  }
  if (groupBy.kind === 'priority') {
    return {
      dotClassName: PRIORITY_DOT[group.key] ?? 'bg-text-muted',
      badgeClassName: PRIORITY_BADGE[group.key] ?? NEUTRAL_BADGE,
    }
  }
  if (groupBy.kind === 'dueDate') {
    return {
      dotClassName: DUE_DATE_DOT[group.key] ?? 'bg-text-muted',
      badgeClassName: DUE_DATE_BADGE[group.key] ?? NEUTRAL_BADGE,
    }
  }
  if (groupBy.kind === 'taskType') {
    return {
      dotClassName: TASK_TYPE_DOT[group.key] ?? 'bg-text-muted',
      badgeClassName: TASK_TYPE_BADGE[group.key] ?? NEUTRAL_BADGE,
    }
  }
  if (groupBy.kind === 'customField' || groupBy.kind === 'label') {
    // Único color que no sale de un mapeo fijo — viene de la propia
    // etiqueta/opción (hex, ver labels.color / project_custom_fields.options).
    return group.color
      ? { dotClassName: '', dotStyle: { backgroundColor: group.color }, badgeClassName: NEUTRAL_BADGE }
      : { dotClassName: 'bg-text-muted', badgeClassName: NEUTRAL_BADGE }
  }
  // assignee — sin color propio, punto gris neutro.
  return { dotClassName: 'bg-text-muted', badgeClassName: NEUTRAL_BADGE }
}

// S-04: fuente única para "Ayuda y atajos" (KeyboardShortcutsDialog.tsx) —
// antes ese ítem del sidebar era un mock "Pronto" y esta lista de atajos
// solo vivía implícita en las ramas del listener de abajo. Mantener ambos
// sincronizados a mano (no hay forma de derivar el texto desde el propio
// `if (e.key === ...)`), pero quedan uno al lado del otro en el mismo
// archivo para que un cambio acá salte a la vista.
export const TASK_VIEW_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'J', label: 'Ir a la tarea siguiente' },
  { keys: 'K', label: 'Ir a la tarea anterior' },
  { keys: 'Shift + J', label: 'Extender la selección hacia abajo' },
  { keys: 'Shift + K', label: 'Extender la selección hacia arriba' },
  { keys: 'X', label: 'Seleccionar / deseleccionar la tarea activa' },
  { keys: 'C', label: 'Crear una tarea nueva' },
  { keys: '1–5', label: 'Mover la selección a esa columna de estado (vista Board)' },
  { keys: 'A', label: 'Agregar asignado a la selección' },
  { keys: 'D', label: 'Cambiar la fecha límite de la selección' },
]

export interface KeyboardShortcutHandlers {
  /** `statusId` resuelto por el hook (tarea activa, o primer grupo si agrupa por status) — el caller decide qué hacer con él (board: foco a la columna; list: foco al único input). */
  onFocusCreateInput: (statusId?: string) => void
  onAssignOpen: () => void
  onDateOpen: () => void
}

export interface NodeViewController {
  tasks: TaskSummary[]
  filteredTasks: TaskSummary[]
  groups: NodeGroup[]
  selection: ReturnType<typeof useTaskSelection>
}

// Consolida lo que hoy duplican board.tsx/list.tsx: fetch + filtrado +
// selección + atajos de teclado comunes (J/K/X/1-5/A/D). El D&D de
// columnas del board (reordenar status, colisiones) NO vive acá — sigue
// siendo propio de board.tsx, que además sigue iterando `statuses`
// directo (no `groups`) para no tocar esa lógica ya delicada.
export function useNodeViewController(
  containerId: string,
  filters: TaskFilters,
  config: ViewConfig,
  handlers: KeyboardShortcutHandlers,
  ctx: GroupContext = {},
): NodeViewController {
  const { data: tasks } = useTasks(containerId, { includeDescription: config.includeDescription })
  const bulkMutation = useBulkUpdateTasksMutation(containerId)
  const filteredByFacets = applyTaskFilters(tasks ?? [], filters)
  const searched = config.searchQuery
    ? filteredByFacets.filter((t) => t.title.toLowerCase().includes(config.searchQuery!.toLowerCase()))
    : filteredByFacets
  const filteredTasks = sortTasks(searched, config.sort)
  const groups = groupTasks(filteredTasks, config.groupBy, ctx)

  // Orden de grupos (column-major para status) para que J/K recorra en
  // el mismo orden visual que se renderiza.
  const orderedIds = groups.flatMap((g) => g.tasks.map((t) => t.id))
  const selection = useTaskSelection(orderedIds)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return

      if (e.key.toLowerCase() === 'c') {
        e.preventDefault()
        // El input "Agregar tarea" de cada columna/sección vive keyeado por
        // `groups[].key` (board.tsx/list.tsx), no por `status_id` — antes
        // sí coincidían porque el único groupBy posible era 'status'. Con
        // "Agrupar por" ya no: se busca el grupo que de verdad contiene la
        // tarea activa (con `assignee`, una tarea puede estar en más de
        // uno — se toma el primero, orden ya es el que se ve en pantalla).
        const activeTask = filteredTasks.find((t) => t.id === selection.activeId)
        const activeGroupKey = activeTask ? groups.find((g) => g.tasks.some((t) => t.id === activeTask.id))?.key : undefined
        handlers.onFocusCreateInput(activeGroupKey ?? groups[0]?.key)
        return
      }
      if (e.key.toLowerCase() === 'j') {
        e.preventDefault()
        if (e.shiftKey) selection.extend(1)
        else selection.move(1)
        return
      }
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (e.shiftKey) selection.extend(-1)
        else selection.move(-1)
        return
      }
      if (e.key.toLowerCase() === 'x') {
        e.preventDefault()
        selection.toggleActive()
        return
      }
      if (e.key === 'Escape' && selection.selectedIds.size > 0) {
        e.preventDefault()
        selection.clear()
        return
      }
      if (/^[1-5]$/.test(e.key) && config.groupBy.kind === 'status') {
        const targetGroup = groups[Number(e.key) - 1]
        if (!targetGroup || selection.selectedIds.size === 0) return
        e.preventDefault()
        // F-06: mismo margen de "Deshacer" que el resto de acciones masivas
        // (ver SelectionActionBar.tsx) — acá el atajo es un solo dígito, más
        // fácil de tocar sin querer que un <Select> con varios pasos.
        const taskIds = [...selection.selectedIds]
        confirmWithUndo(
          `${taskIds.length} tarea${taskIds.length === 1 ? '' : 's'} → ${targetGroup.label}.`,
          () => bulkMutation.mutate({ taskIds, fields: { status_id: targetGroup.key } }),
        )
        return
      }
      if (e.key.toLowerCase() === 'a' && selection.selectedIds.size > 0) {
        e.preventDefault()
        handlers.onAssignOpen()
        return
      }
      if (e.key.toLowerCase() === 'd' && selection.selectedIds.size > 0) {
        e.preventDefault()
        handlers.onDateOpen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection, groups, filteredTasks, bulkMutation, config.groupBy.kind, handlers])

  return { tasks: tasks ?? [], filteredTasks, groups, selection }
}
