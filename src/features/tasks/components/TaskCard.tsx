import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import type { TaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'
import { useMoveTaskMutation } from '@/features/tasks/mutations'
import { PRIORITY_DOT, PRIORITY_LABEL, PRIORITY_TEXT } from '@/features/tasks/priority'
import { isDoneStatus } from '@/features/projects/status-kind'
import { between } from '@/lib/position'
import { useDensity } from '@/lib/density'
import { useTaskViewMode } from '@/features/nodes/task-view-mode'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { initials } from '@/lib/initials'
import { formatDeliveryState, type DeliveryState } from '@/features/tasks/delivery-state'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { LabelPicker } from '@/features/labels/components/LabelPicker'
import { cn } from '@/lib/utils'

// 'overdue' (sigue abierta, atrasada) es la única que de verdad alarma —
// 'late' (se entregó tarde) es dato histórico, ya resuelto, no una
// alarma activa. Antes de delivery-state.ts (ver ese archivo) esta
// tarjeta usaba formatDueDate, que no distinguía "vencida" de "vencida
// pero ya entregada" — una tarea Hecha con fecha pasada se veía roja
// igual, como si siguiera atrasada.
const DUE_DATE_STATE_CLASS: Record<DeliveryState, string> = {
  overdue: 'text-danger-text',
  today: 'text-accent-2-text-on-bg',
  upcoming: 'text-text-muted',
  ontime: 'text-text-muted',
  late: 'text-accent-2-text-on-bg',
}

// 3 avatares visibles + "+N": suficiente para distinguir "quiénes" de un
// vistazo en una tarjeta angosta sin que el stack compita con el resto del
// contenido — el mismo límite se repite en TaskRow.tsx y GanttRow.tsx.
const MAX_ASSIGNEE_AVATARS = 3

interface TaskCardProps {
  task: TaskSummary
  projectId: string
  selected?: boolean
  // Ambos opcionales: en el DragOverlay (board.tsx) se renderiza una
  // TaskCard "de vista" sin estos datos — ahí el checkbox de completar
  // no aparece, no hace falta que sea interactivo mientras se arrastra.
  statuses?: StatusSummary[]
  allTasks?: TaskSummary[]
}

export function TaskCard({ task, projectId, selected, statuses, allTasks }: TaskCardProps) {
  const density = useDensity()
  const compact = density === 'compact'
  const viewMode = useTaskViewMode()
  const setNode = useSetNodeSearchParam()
  const moveMutation = useMoveTaskMutation(projectId)

  const currentStatus = statuses?.find((s) => s.id === task.status_id)
  const isDone = isDoneStatus(currentStatus?.status_kind)
  const dueDate = formatDeliveryState(task.due_date, isDone, task.completed_at)
  const { workspaceId } = useCurrentWorkspace()

  // Mismo criterio que SubtaskList.tsx: togglear completar mueve la tarea
  // entre el status "success" y el status default del proyecto, en vez de
  // exigir abrir el <Select> de estado.
  function toggleDone() {
    if (!statuses || !allTasks) return
    const doneStatus = statuses.find((s) => s.status_kind === 'success')
    const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0]
    const target = isDone ? defaultStatus : doneStatus
    if (!target) return
    const lastInColumn = allTasks
      .filter((t) => t.status_id === target.id && t.id !== task.id)
      .sort((a, b) => b.position - a.position)[0]
    moveMutation.mutate({ taskId: task.id, statusId: target.id, position: between(lastInColumn?.position, undefined) })
  }

  return (
    <Link
      id={`task-${task.id}`}
      to="/p/$projectId/t/$taskId"
      params={{ projectId, taskId: task.id }}
      onClick={(e) => {
        // 'side'/'modal': abre el Sideview/modal sobre la vista actual en
        // vez de navegar a la página completa. 'full' deja que el <Link>
        // navegue normal (comportamiento de siempre).
        if (viewMode === 'side' || viewMode === 'modal') {
          e.preventDefault()
          setNode(task.id)
        }
      }}
      className={cn(
        // `active:bg-surface-alt`: la tarjeta solo daba señal de toque por
        // hover (el `-translate-y-px`), que en táctil no existe — no había
        // forma de saber si el tap había agarrado.
        //
        // bg-surface, no bg-bg (plan de corrección de layout, ronda 2,
        // 2026-09-24): en Board esta tarjeta vive sobre una columna
        // bg-surface-alt — con bg-bg (más oscuro que la columna) se leía
        // al revés de lo esperado. bg-surface es blanco/claro de verdad,
        // así que resalta como "el objeto" contra el fondo de la columna.
        'flex flex-col rounded-card border border-border bg-surface text-sm shadow-card transition-all active:bg-surface-alt hover:-translate-y-px hover:border-border hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent',
        compact ? 'gap-1 p-2' : 'gap-2 p-3',
        selected && 'border-accent/40 bg-accent-soft/60 ring-2 ring-accent',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {statuses && allTasks && (
          // El checkbox vive dentro del <Link> de la tarjeta — sin
          // preventDefault/stopPropagation acá, clickearlo también
          // navegaría a la tarea en vez de solo togglear el estado.
          //
          // Sin `onCheckedChange` en el <Checkbox>: Radix ya dispara su
          // propio click handler interno al clickear (fase de "target",
          // antes de que el evento burbujee), así que tenerlo ADEMÁS del
          // `onClick` de este <span> disparaba `toggleDone()` dos veces por
          // clic. El `<button>` nativo que Radix renderiza igual dispara
          // `click` con Space/Enter, que burbujea hasta acá — no hace falta
          // `onCheckedChange` para que el teclado siga funcionando.
          <span
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleDone()
            }}
            className="shrink-0"
          >
            <Checkbox checked={isDone} aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'} />
          </span>
        )}
        <span className={cn('min-w-0 truncate font-medium text-text', isDone && 'text-text-muted line-through')}>
          {task.title}
        </span>
      </div>
      {!compact && (task.task_labels.length > 0 || workspaceId) && (
        <div className="flex flex-wrap items-center gap-1">
          {task.task_labels.map(({ label }) => (
            <span
              key={label.id}
              className="max-w-[7rem] truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: label.color ?? undefined }}
            >
              {label.name}
            </span>
          ))}
          {/* Antes solo se podían agregar/quitar etiquetas abriendo la
              tarea — pedido explícito del usuario: poder hacerlo desde
              donde ya se ven (tablero/lista), igual que ClickUp/Asana.
              `stopPropagation`, no solo `preventDefault`: toda la tarjeta
              es un <Link>, y sin cortar la propagación el clic en el "+"
              también navegaría a la tarea. */}
          {workspaceId && (
            <span onClick={(e) => e.stopPropagation()}>
              <LabelPicker
                workspaceId={workspaceId}
                task={{ projectId, taskId: task.id, assignedLabels: task.task_labels.map((tl) => tl.label) }}
                compact
              />
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn('size-1.5 shrink-0 rounded-full', PRIORITY_DOT[task.priority])}
            title={PRIORITY_LABEL[task.priority] ?? task.priority}
          />
          {!compact && (
            <span className={cn(PRIORITY_TEXT[task.priority])}>
              {PRIORITY_LABEL[task.priority] ?? task.priority}
            </span>
          )}
          {!compact && dueDate && (
            <span className={cn('flex items-center gap-1', DUE_DATE_STATE_CLASS[dueDate.state])}>
              <HugeiconsIcon icon={Calendar01Icon} className="size-3" />
              {dueDate.label}
            </span>
          )}
        </div>
        {task.task_assignees.length > 0 && (
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
        )}
      </div>
    </Link>
  )
}
