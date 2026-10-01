import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon, Flag01Icon, ChevronDownIcon, ChevronRightIcon } from '@hugeicons/core-free-icons'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { between } from '@/lib/position'
import { useMoveTaskMutation } from '@/features/tasks/mutations'
import { useSubtasks, type TaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'
import { PRIORITY_TEXT, PRIORITY_LABEL } from '@/features/tasks/priority'
import { STATUS_KIND_BADGE, STATUS_KIND_DOT, isDoneStatus } from '@/features/projects/status-kind'
import { useDensity } from '@/lib/density'
import { useTaskViewMode } from '@/features/nodes/task-view-mode'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { useListFieldVisibility } from '@/features/nodes/list-fields'
import { stripHtmlPreview } from '@/lib/strip-html'
import { initials } from '@/lib/initials'
import { formatDeliveryState, type DeliveryState } from '@/features/tasks/delivery-state'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { LabelPicker } from '@/features/labels/components/LabelPicker'
import { SubtaskInlineRow } from '@/features/tasks/components/SubtaskInlineRow'
import { LIST_ROW_GRID_NARROW, LIST_ROW_GRID_WIDE, extraColumnsGridTemplate } from '@/features/tasks/components/list-row-grid'
import type { CustomFieldDefinition } from '@/features/custom-fields/queries'
import type { Json } from '@/features/nodes/types'
import { cn } from '@/lib/utils'

// Ver el mismo comentario en TaskCard.tsx: 'overdue' alarma (sigue
// abierta y atrasada), 'late' es dato histórico (ya se entregó, solo
// tarde) — antes ambas se veían rojas por igual.
const DUE_DATE_STATE_CLASS: Record<DeliveryState, string> = {
  overdue: 'text-danger-text',
  today: 'text-accent-2-text-on-bg',
  upcoming: 'text-text-muted',
  ontime: 'text-text-muted',
  late: 'text-accent-2-text-on-bg',
}

// Mismo límite que TaskCard.tsx/GanttRow.tsx.
const MAX_ASSIGNEE_AVATARS = 3

// Columna extra genérica (campo personalizado agregado a mano, "+
// Añadir" del encabezado): un select muestra su opción como chip de
// color (mismo dato que ya pinta CustomFieldInputs), cualquier otro
// tipo se muestra como texto plano. No es un renderizador pulido por
// tipo (eso sería repetir el trabajo de CustomFieldInputs.tsx) — alcanza
// para que la columna sea legible sin abrir la tarea.
function renderCustomFieldValue(field: CustomFieldDefinition, value: Json | undefined) {
  if (value === undefined || value === null || value === '') return <span className="text-text-muted">—</span>
  if (field.field_type === 'select') {
    const option = field.options?.find((o) => o.id === value)
    if (option) {
      return (
        <span
          className="max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: option.color ?? undefined }}
        >
          {option.label}
        </span>
      )
    }
  }
  return <span className="truncate">{String(value)}</span>
}

export interface ExtraColumnValue {
  field: CustomFieldDefinition
  value: Json | undefined
}

interface TaskRowProps {
  task: TaskSummary
  projectId: string
  statuses: StatusSummary[]
  allTasks: TaskSummary[]
  selected?: boolean
  /** 0 u omitido: sin toggle de expandir. Viene de un conteo en bloque
   * (useSubtaskCounts en list.tsx), no de traer las subtareas — recién
   * se piden de verdad al expandir (ver `expanded` abajo). */
  subtaskCount?: number
  /** "+ Añadir" del encabezado (list.tsx) — campos personalizados
   * elegidos a mano como columna, con su valor ya resuelto para esta
   * tarea puntual. */
  extraColumns?: ExtraColumnValue[]
}

export function TaskRow({
  task,
  projectId,
  statuses,
  allTasks,
  selected,
  subtaskCount = 0,
  extraColumns = [],
}: TaskRowProps) {
  const moveMutation = useMoveTaskMutation(projectId)
  const density = useDensity()
  const compact = density === 'compact'
  const viewMode = useTaskViewMode()
  const setNode = useSetNodeSearchParam()
  const fieldVisibility = useListFieldVisibility(projectId)
  const { workspaceId } = useCurrentWorkspace()
  const [expanded, setExpanded] = useState(false)
  // Recién habilitada cuando se expande (`enabled`, ver subtasksQueryOptions) —
  // mostrar subtareas inline (pedido del usuario, criterio ClickUp) no
  // debe disparar un fetch por CADA tarea de la lista solo con montarse.
  const { data: subtasks } = useSubtasks(task.id, { enabled: expanded })

  const currentStatus = statuses.find((s) => s.id === task.status_id)
  const isDone = isDoneStatus(currentStatus?.status_kind)
  const dueDate = formatDeliveryState(task.due_date, isDone, task.completed_at)
  const hasExtraColumns = extraColumns.length > 0

  function moveToStatus(statusId: string) {
    const lastInColumn = allTasks
      .filter((t) => t.status_id === statusId && t.id !== task.id)
      .sort((a, b) => b.position - a.position)[0]
    const position = between(lastInColumn?.position, undefined)
    moveMutation.mutate({ taskId: task.id, statusId, position })
  }

  // Mismo criterio que SubtaskList.tsx y TaskCard.tsx: togglear completar
  // mueve la tarea entre el status "success" y el status default, sin
  // exigir abrir el <Select> de estado de al lado.
  function toggleDone() {
    const doneStatus = statuses.find((s) => s.status_kind === 'success')
    const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0]
    const target = isDone ? defaultStatus : doneStatus
    if (target) moveToStatus(target.id)
  }

  // El <Select> de Estado como pill de color — mismo patrón ya probado en
  // NodeDetailContent.tsx (STATUS_KIND_BADGE, el mismo tono suave que ya
  // usa el resto de la app, no un relleno sólido nuevo: varios
  // --status-X son claros en modo oscuro — pensados para texto sobre su
  // propio -bg, no para fondo sólido con texto blanco encima — inventar
  // esa variante ahora habría arriesgado contraste real sin poder
  // probarlo en un navegador).
  const estadoSelect = (
    <Select value={task.status_id ?? undefined} onValueChange={moveToStatus}>
      <SelectTrigger
        size="sm"
        className={cn(
          'h-auto! w-fit gap-1 rounded-full border-transparent px-2! py-0.5! text-xs! font-medium [&_svg]:size-3',
          currentStatus && STATUS_KIND_BADGE[currentStatus.status_kind],
        )}
      >
        <SelectValue>{currentStatus?.name}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            <span className={cn('size-1.5 rounded-full', STATUS_KIND_DOT[status.status_kind])} />
            {status.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  // Sin columnas extra: la grilla es una clase de Tailwind estática
  // (responsive angosto/ancho de verdad). Con columnas extra: un número
  // variable de tracks no se puede expresar como clase — se arma en JS
  // (list-row-grid.ts) y se aplica por `style`. Ver ese archivo para el
  // porqué se abandona el responsive angosto en ese caso a propósito.
  const gridClassName = !hasExtraColumns && cn(LIST_ROW_GRID_NARROW, LIST_ROW_GRID_WIDE)
  const gridStyle = hasExtraColumns ? { gridTemplateColumns: extraColumnsGridTemplate(extraColumns.length) } : undefined
  // Mismo criterio: con columnas extra activas, los campos que normalmente
  // se ocultan bajo 640px quedan siempre visibles (no hay a qué ancho
  // "angosto" volver cuando la fila ya tiene 7+ columnas) — el
  // contenedor de la lista scrollea horizontal en pantallas angostas en
  // vez de intentar wrappear todo.
  const metaVisibility = hasExtraColumns ? 'flex' : 'hidden @min-[640px]:flex'

  return (
    <>
      <div
        className={cn(
          'group grid items-center gap-3 rounded-md px-2 text-sm transition-colors hover:bg-surface-alt',
          gridClassName,
          // 44px de alto mínimo mientras el contenedor sea angosto — el
          // mínimo táctil real, y el alto de fila del prototipo. Compacto/
          // Cómodo recién se distinguen desde @min-[640px]: son una
          // preferencia de densidad de una tabla ancha (y en mobile el
          // toggle ni siquiera se muestra, ver ProjectToolbar.tsx), no una
          // excusa para filas de 28px bajo el pulgar.
          'min-h-11',
          compact ? '@min-[640px]:min-h-7' : '@min-[640px]:min-h-10',
          selected && 'bg-accent-soft hover:bg-accent-soft',
        )}
        style={gridStyle}
      >
        <Checkbox
          checked={isDone}
          aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
          onCheckedChange={toggleDone}
          // El primitivo ya extiende su área de toque con `after:-inset-*`;
          // acá se estira un poco más en alto para cubrir la fila de 44px
          // completa, y el cuadrado crece a 20px en angosto (el de 16px es
          // el borde inferior de lo señalable con el dedo).
          className="size-5 after:-inset-y-3 @min-[640px]:size-4 @min-[640px]:after:-inset-y-2"
        />
        {/* Título + toggle de subtareas + etiquetas en la misma celda:
            "Etiquetas" ya no es una columna aparte (auditoría de diseño)
            — viajaban vacías en la inmensa mayoría de las filas,
            inflando la fila con una columna casi siempre en blanco. */}
        <div className="flex min-w-0 items-center gap-1.5">
          {subtaskCount > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Contraer subtareas' : `Mostrar ${subtaskCount} subtareas`}
              aria-expanded={expanded}
              // size-8 (32px) mientras el contenedor es angosto: a 16px el
              // chevron de subtareas era el control más chico de toda la
              // lista y el más fácil de errar con el dedo. En ancho vuelve
              // a 16px, donde se apunta con el mouse.
              className="flex size-8 shrink-0 items-center justify-center rounded text-text-muted transition-colors active:bg-surface-alt hover:bg-surface-alt hover:text-text @min-[640px]:size-4"
            >
              <HugeiconsIcon icon={expanded ? ChevronDownIcon : ChevronRightIcon} className="size-3" />
            </button>
          ) : (
            <span className="size-8 shrink-0 @min-[640px]:size-4" aria-hidden="true" />
          )}
          <Link
            id={`task-${task.id}`}
            to="/p/$projectId/t/$taskId"
            params={{ projectId, taskId: task.id }}
            onClick={(e) => {
              if (viewMode === 'side' || viewMode === 'modal') {
                e.preventDefault()
                setNode(task.id)
              }
            }}
            className={cn(
              // `min-w-0` (no `shrink-0`, B-05): las dos clases se cancelan
              // — `truncate` necesita poder encogerse para recortar, y
              // `shrink-0` se lo prohibía.
              'min-w-0 truncate hover:underline focus-visible:outline-2 focus-visible:outline-accent',
              isDone && 'text-text-muted line-through',
            )}
          >
            {task.title}
          </Link>
          {fieldVisibility.description && task.description && (
            <span className="truncate text-xs text-text-muted">— {stripHtmlPreview(task.description)}</span>
          )}
          {!compact && (
            <>
              {task.task_labels.map(({ label }) => (
                <span
                  key={label.id}
                  className="max-w-[7rem] shrink-0 truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: label.color ?? undefined }}
                >
                  {label.name}
                </span>
              ))}
              {/* Pedido explícito del usuario: poder agregar/quitar
                  etiquetas desde donde ya se ven, no solo abriendo la
                  tarea — mismo criterio que ClickUp/Asana. Oculto hasta
                  el hover/foco de la fila (`group` en el div raíz): sin
                  esto, el "+" quedaba permanentemente pegado al título en
                  CADA fila sin etiquetas — la inmensa mayoría — sumando
                  ruido visual constante por una acción de uso ocasional.
                  Reportado por el usuario ("desordenado"). */}
              {/* `hidden @min-[640px]:inline`: revelado por hover, en táctil
                  este "+" no aparecía NUNCA — no hay hover que lo dispare,
                  así que en mobile era un control invisible ocupando su
                  lugar en el DOM. Agregar etiquetas desde la fila queda
                  como gesto de escritorio; en mobile se hace abriendo la
                  tarea, que es donde igual se termina yendo. */}
              {workspaceId && (
                <span className="hidden opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 @min-[640px]:inline">
                  <LabelPicker
                    workspaceId={workspaceId}
                    task={{ projectId, taskId: task.id, assignedLabels: task.task_labels.map((tl) => tl.label) }}
                    compact
                  />
                </span>
              )}
            </>
          )}
        </div>

        {/* Asignado → Fecha → Prioridad, en ese orden — mismo orden que la
            captura de ClickUp que compartió el usuario. */}
        {fieldVisibility.assignee && (
          <span className={metaVisibility}>
            {task.task_assignees.length > 0 ? (
              <AvatarGroup>
                {task.task_assignees.slice(0, MAX_ASSIGNEE_AVATARS).map((a) => (
                  <Avatar key={a.user_id} size="sm">
                    {a.assignee?.avatar_url && <AvatarImage src={a.assignee.avatar_url} alt="" />}
                    <AvatarFallback>{initials(a.assignee?.full_name)}</AvatarFallback>
                  </Avatar>
                ))}
                {task.task_assignees.length > MAX_ASSIGNEE_AVATARS && (
                  <AvatarGroupCount>+{task.task_assignees.length - MAX_ASSIGNEE_AVATARS}</AvatarGroupCount>
                )}
              </AvatarGroup>
            ) : (
              <span className="size-6" />
            )}
          </span>
        )}
        {fieldVisibility.dueDate && (
          <span
            className={cn(
              'items-center gap-1 text-xs',
              metaVisibility,
              dueDate ? DUE_DATE_STATE_CLASS[dueDate.state] : 'text-text-muted',
            )}
          >
            {dueDate && <HugeiconsIcon icon={Calendar01Icon} className="size-3" />}
            {dueDate?.label ?? '—'}
          </span>
        )}
        {/* Prioridad: solo la bandera de color, sin texto ni pill propia —
            el detalle exacto de la captura de ClickUp. Con Estado como
            único pill "con caja" de la fila, prioridad no compite por el
            mismo golpe de vista. */}
        {fieldVisibility.priority && (
          <span className={metaVisibility} title={PRIORITY_LABEL[task.priority] ?? task.priority}>
            <HugeiconsIcon icon={Flag01Icon} className={cn('size-3', PRIORITY_TEXT[task.priority])} />
          </span>
        )}
        {/* Estado: el único campo visible en los dos anchos (angosto solo
            muestra checkbox+título+Estado) — sin `hidden` a propósito, un
            solo <Select> que el auto-placement de grid ubica solo en la
            última columna "fija" de la plantilla activa. */}
        {estadoSelect}
        {/* Columnas extra ("+ Añadir" del encabezado) — campos
            personalizados elegidos a mano. */}
        {extraColumns.map(({ field, value }) => (
          <span key={field.id} className="flex min-w-0 items-center text-xs text-text-secondary">
            {renderCustomFieldValue(field, value)}
          </span>
        ))}
      </div>

      {expanded &&
        (subtasks ?? []).map((subtask) => (
          <SubtaskInlineRow key={subtask.id} subtask={subtask} projectId={projectId} parentId={task.id} statuses={statuses} />
        ))}
    </>
  )
}
