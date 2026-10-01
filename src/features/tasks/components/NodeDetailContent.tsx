import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  Delete02Icon,
  MultiplicationSignIcon,
  Folder02Icon,
  Copy01Icon,
  Share08Icon,
  BookmarkAdd01Icon,
  CheckmarkCircle02Icon,
  UserMultiple02Icon,
  Calendar01Icon,
  Flag01Icon,
  Tag01Icon,
  MoreHorizontalIcon,
  Edit02Icon,
  StarIcon,
  Diamond01Icon,
  CircleArrowLeft01Icon,
  CircleArrowRight01Icon,
  Cancel01Icon,
  LockIcon,
  Globe02Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { useCurrentWorkspace, useWorkspaceMembers } from '@/features/workspace/queries'
import { useProject, useStatuses } from '@/features/projects/queries'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { useLastProjectView } from '@/features/projects/last-project-view'
import { useSubtasks, useTaskDetail, useTaskRecurrence } from '@/features/tasks/queries'
import { useActivity } from '@/features/activity/queries'
import type { ActivityEntry } from '@/features/activity/queries'
import {
  DELETE_UNDO_DELAY_MS,
  useDeleteTaskMutation,
  useDuplicateTaskMutation,
  useResolveSubtasksMutation,
  useRestoreSubtasksMutation,
  useUpdateTaskFieldsMutation,
  useUpdateTaskRecurrenceMutation,
} from '@/features/tasks/mutations'
import { PRIORITIES, PRIORITY_BADGE, PRIORITY_LABEL } from '@/features/tasks/priority'
import { STATUS_KIND_BADGE, isClosedStatus, isDoneStatus } from '@/features/projects/status-kind'
import { TaskDescriptionEditor } from '@/features/tasks/components/TaskDescriptionEditor'
import { TaskDateRangePicker } from '@/features/tasks/components/TaskDateRangePicker'
import { SubtaskList } from '@/features/tasks/components/SubtaskList'
import { CloseWithSubtasksDialog, type SubtaskCloseAction } from '@/features/tasks/components/CloseWithSubtasksDialog'
import { RestoreSubtasksDialog, type RestoreCandidate } from '@/features/tasks/components/RestoreSubtasksDialog'
import { NodeAccessDialog } from '@/features/sharing/components/NodeAccessDialog'
import { ActivityCommentThread } from '@/features/tasks/components/ActivityCommentThread'
import { CommentForm } from '@/features/comments/components/CommentForm'
import { TimeTrackingPopover } from '@/features/time-tracking/components/TimeTrackingPopover'
import { AttachmentList } from '@/features/attachments/components/AttachmentList'
import { LabelPicker } from '@/features/labels/components/LabelPicker'
import { Breadcrumb } from '@/features/nodes/components/Breadcrumb'
import { useNodeDependencies } from '@/features/tasks/dependencies/queries'
import { useAddNodeDependencyMutation, useRemoveNodeDependencyMutation } from '@/features/tasks/dependencies/mutations'
import { TaskDependencyPicker } from '@/features/tasks/dependencies/components/TaskDependencyPicker'
import { ResponsablePicker } from '@/features/assignees/components/ResponsablePicker'
import { WatchToggle } from '@/features/watchers/components/WatchToggle'
import { ReviewerPicker } from '@/features/reviewers/components/ReviewerPicker'
import { ReviewerApprovalBar } from '@/features/reviewers/components/ReviewerApprovalBar'
import { CustomFieldInputs } from '@/features/custom-fields/components/CustomFieldInputs'
import { useTaskReviewers } from '@/features/reviewers/queries'
import { SaveAsTemplateDialog } from '@/features/templates/components/SaveAsTemplateDialog'
import { useSaveTaskAsTemplateMutation } from '@/features/templates/mutations'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/initials'
import { TaskPresenceAvatars } from '@/features/tasks/components/TaskPresenceAvatars'
import { useSetNodeSearchParam } from '@/lib/node-param'
import {
  useTaskViewMode,
  useIsTaskViewModeForced,
  setTaskViewMode,
  type TaskViewMode,
} from '@/features/nodes/task-view-mode'
import { recordView } from '@/features/recent-views/api'
import { formatNumericDate } from '@/lib/format-date'
import { formatDeliveryState, type DeliveryState } from '@/features/tasks/delivery-state'
import { cn } from '@/lib/utils'

// Shape de cada entrada de `payload.completed`/`payload.dropped` en una
// actividad 'subtasks_closed' (trg_close_open_subtasks_on_parent_done,
// 0081/0082) — `previous_status_id` puede faltar en entradas viejas
// (de antes de 0082, rama `completed`), por eso es opcional acá.
interface CascadeSubtask {
  id: string
  title: string
  previous_status_id?: string
}

const VIEW_MODE_LABEL: Record<TaskViewMode, string> = {
  side: 'Lateral',
  modal: 'Modal',
  full: 'Página completa',
}

interface NodeDetailContentProps {
  nodeId: string
  /** Presente cuando se muestra en Sheet/Dialog (Sideview/modal) — ausente en la ruta de página completa. */
  onClose?: () => void
}

// Extraído de la vieja ruta de página completa (`t.$taskId.tsx`) para
// poder reusarse dentro de Sheet (Sideview), Dialog (modal) o la propia
// página completa — ver AppShell.tsx. Deriva `containerId` de los datos
// de la tarea (`memberships[0]?.container_id`), no de un param de ruta:
// así funciona igual sin importar desde dónde se monte.
export function NodeDetailContent({ nodeId, onClose }: NodeDetailContentProps) {
  const navigate = useNavigate()
  const setNode = useSetNodeSearchParam()
  const viewMode = useTaskViewMode()
  const isViewModeForced = useIsTaskViewModeForced()

  const { data: task, isPending: taskPending, isError: taskError } = useTaskDetail(nodeId)
  const containerId = task?.memberships[0]?.container_id ?? ''
  const { data: parentTask } = useTaskDetail(task?.parent_id ?? '')
  const { data: project } = useProject(containerId)
  const { data: statuses } = useStatuses(containerId)
  const { workspaceId } = useCurrentWorkspace()
  const { data: members } = useWorkspaceMembers(workspaceId ?? '')
  const { data: session } = useSession()
  // Preferencias (0058_profile_preferences.sql): "Creada el" respeta el
  // formato de fecha elegido en vez del "d MMM" fijo de formatShortDate.
  const { data: preferenceProfile } = useProfile(session?.user.id ?? '')
  // El chip "Lista" de abajo iba siempre a /summary — mismo criterio que
  // el árbol/favoritos del sidebar (S-03/S-09): respeta la última vista
  // visitada de ese proyecto, o la vista por defecto de la cuenta si
  // todavía no visitó ninguna.
  const lastProjectView = useLastProjectView(containerId, defaultViewToRoute(preferenceProfile?.default_view))

  const updateMutation = useUpdateTaskFieldsMutation(containerId, nodeId)
  // { workspaceId, userId }: además de la lista del proyecto (containerId),
  // borrar acá también tiene que limpiar Mi trabajo/Lista personal/
  // Delegado si la tarea aparecía ahí — ver el comentario de
  // useDeleteTaskMutation en mutations.ts.
  const deleteMutation = useDeleteTaskMutation(containerId, workspaceId ? { workspaceId, userId: session?.user.id } : undefined)
  const duplicateMutation = useDuplicateTaskMutation(containerId)
  const recurrenceMutation = useUpdateTaskRecurrenceMutation(containerId, nodeId)
  const recurrenceQuery = useTaskRecurrence(nodeId)
  const resolveSubtasksMutation = useResolveSubtasksMutation(nodeId, containerId)
  const restoreSubtasksMutation = useRestoreSubtasksMutation(nodeId, containerId)
  const { data: subtasks } = useSubtasks(nodeId)
  // R3 ("Cerrar con subtareas abiertas"): buscar acá, no recién al
  // reabrir, para tener la última entrada 'subtasks_closed' ya en cache
  // (ActivityCommentThread pide la misma query más abajo con el mismo
  // taskId — TanStack Query la deduplica, no es un round-trip extra).
  const { data: activity } = useActivity(nodeId)
  const { data: reviewers } = useTaskReviewers(nodeId)
  const { data: dependencies } = useNodeDependencies(nodeId)
  const addDependencyMutation = useAddNodeDependencyMutation(nodeId)
  const removeDependencyMutation = useRemoveNodeDependencyMutation(nodeId)
  const [title, setTitle] = useState(task?.title ?? '')
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const saveAsTemplateMutation = useSaveTaskAsTemplateMutation(workspaceId ?? '')
  // "Cerrar con subtareas abiertas" — declarados acá arriba, antes de los
  // `return` tempranos de más abajo (taskPending/taskError), no al lado
  // de `requestStatusChange` donde se usan: los Hooks no pueden quedar
  // después de un return condicional (Rules of Hooks).
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null)
  // R3 (reabrir): mismo motivo de ubicación que el par de arriba — Hooks
  // antes de cualquier return condicional.
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false)
  const [pendingReopenStatusId, setPendingReopenStatusId] = useState<string | null>(null)
  // R4 (sugerir cerrar, nunca auto-cerrar): se resetea solo cuando deja de
  // aplicar (una subtarea se reabre o se agrega una nueva) — así, si
  // vuelve a darse la condición más adelante, el banner reaparece en vez
  // de quedar descartado para siempre por un click de hace rato.
  const [suggestCloseDismissed, setSuggestCloseDismissed] = useState(false)
  const subtasksAllClosed = (subtasks?.length ?? 0) > 0 && (subtasks ?? []).every((s) => isClosedStatus(s.status?.status_kind))
  useEffect(() => {
    if (!subtasksAllClosed) setSuggestCloseDismissed(false)
  }, [subtasksAllClosed])

  // Espejo de R4: encontrado probando el propio banner de arriba — un
  // padre ya cerrado (Hecho o Descartado) puede terminar con una subtarea
  // abierta por debajo sin que nada lo note, en dos casos que el
  // artifact original no cubría: se agrega una subtarea nueva DESPUÉS de
  // cerrar el padre (el cascade solo reacciona al propio cambio de
  // estado del padre, no a subtareas creadas después), o alguien
  // destilda una subtarea ya cerrada a mano (el checkbox de
  // SubtaskList.tsx es un toggle directo, sin relación con el estado del
  // padre). Mismo criterio que arriba: sugerencia descartable, nunca
  // reabre solo.
  const [orphanSubtaskDismissed, setOrphanSubtaskDismissed] = useState(false)
  const parentStatusKindForEffect = statuses?.find((s) => s.id === task?.status_id)?.status_kind
  const hasOrphanOpenSubtask =
    isClosedStatus(parentStatusKindForEffect) &&
    (subtasks ?? []).some((s) => !isClosedStatus(s.status?.status_kind))
  useEffect(() => {
    if (!hasOrphanOpenSubtask) setOrphanSubtaskDismissed(false)
  }, [hasOrphanOpenSubtask])

  // `useTaskDetail` casi siempre sigue en vuelo en el primer render de esta
  // instancia (se monta al abrir el panel, antes de que la query resuelva)
  // — sin este efecto, `title` quedaba en '' para siempre (el
  // inicializador de useState no se vuelve a correr) hasta que `task`
  // llegara, y `value={title || task.title}` tapaba el síntoma con un
  // fallback que además reintroducía B-04 (mismo componente, misma
  // instancia, entre dos tareas) si no fuera por el `key={nodeId}` del
  // punto de montaje. Sincronizar acá cuando cambia `task?.id` (no en
  // cada cambio de `task`) es lo que permite quitar ese fallback sin
  // pisar lo que el usuario esté escribiendo.
  useEffect(() => {
    if (task) setTitle(task.title)
    // Deliberado (ver el comentario de arriba): agregar `task`/`task.title`
    // re-dispararía este efecto en cada refetch/patch de Realtime y
    // pisaría lo que el usuario esté escribiendo, no solo al cambiar de
    // tarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  // Best-effort: registra "visto recientemente" (home "Mis tareas" /
  // widget Recientes) — no bloquea el render ni molesta al usuario si
  // falla (offline, RLS, lo que sea), por eso el catch silencioso.
  const userId = session?.user.id
  useEffect(() => {
    if (userId) recordView(userId, nodeId).catch(() => {})
  }, [userId, nodeId])

  // Antes esto era `if (!task) return null` a secas: el Sheet/Dialog ya
  // está abierto (su `open` depende solo de `selectedNodeId`, no de si la
  // query resolvió — ver AppShell.tsx) así que un panel en blanco no
  // distinguía "todavía está cargando" de "esta tarea ya no existe" (la
  // borró otra persona, o el `?node=` de un enlace compartido apunta a
  // algo que no está más) — quedaba vacío para siempre, sin explicación
  // ni botón de cerrar propio (B-06).
  if (taskPending) {
    return (
      <div className={cn('@container animate-pulse', onClose ? 'flex h-full flex-col p-4 @min-[640px]:p-6' : 'p-4 @min-[640px]:p-6')}>
        <div className="mb-6 h-7 w-2/3 rounded-md bg-surface-alt" />
        <div className="mb-3 h-4 w-1/3 rounded-md bg-surface-alt" />
        <div className="h-32 rounded-md bg-surface-alt" />
      </div>
    )
  }
  if (taskError || !task) {
    return (
      <div className="@container flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-text-muted">Esta tarea ya no existe.</p>
        <Button variant="outline" size="sm" onClick={handleClose}>
          Cerrar
        </Button>
      </div>
    )
  }

  function handleClose() {
    if (onClose) {
      onClose()
    } else if (containerId) {
      navigate({ to: '/p/$projectId/board', params: { projectId: containerId } })
    } else {
      // Página completa + tarea inexistente: no hay containerId al cual
      // volver (la tarea nunca cargó) — Inicio es el único destino que
      // siempre existe.
      navigate({ to: '/' })
    }
  }

  // F-06: antes esto vivía detrás de un AlertDialog bloqueante ("no se
  // puede deshacer"). El remove optimista de useDeleteTaskMutation ya hace
  // desaparecer la fila al toque — cerrar el panel de una sigue esa misma
  // señal en vez de esperar a que el servidor confirme (eso ahora tarda
  // DELETE_UNDO_DELAY_MS a propósito, ver mutations.ts). `undoState` es el
  // mismo objeto que lee la mutación: si "Deshacer" lo marca `cancelled`
  // antes de que se cumpla el margen, el DELETE real nunca llega a salir.
  function handleDeleteTask() {
    if (!task) return
    const undoState = { cancelled: false }
    deleteMutation.mutate({ taskId: nodeId, undoState })
    handleClose()
    toast(`Se eliminó "${task.title}".`, {
      duration: DELETE_UNDO_DELAY_MS,
      action: {
        label: 'Deshacer',
        onClick: () => {
          undoState.cancelled = true
        },
      },
    })
  }

  // Único punto que decide cómo pasar de un modo a otro — antes el
  // selector de modo solo se mostraba con `onClose` presente, así que
  // desde la página completa (sin onClose) no había forma de volver a
  // side/modal. Ahora el selector siempre está visible y esta función
  // resuelve la navegación según de dónde se parte:
  function handleModeChange(nextMode: TaskViewMode) {
    setTaskViewMode(nextMode)
    if (!containerId) return
    if (nextMode === 'full') {
      if (onClose) {
        // Desde Sheet/Dialog: ir a la página completa y limpiar ?node=.
        setNode(null)
        navigate({ to: '/p/$projectId/t/$taskId', params: { projectId: containerId, taskId: nodeId } })
      }
      // Si ya estamos en la página completa, no hay nada que navegar.
      return
    }
    if (!onClose) {
      // Desde la página completa hacia side/modal: no hay board/list de
      // fondo acá — hay que navegar a uno con el nodo abierto para que
      // el nuevo modo tenga dónde mostrarse.
      navigate({
        to: '/p/$projectId/board',
        params: { projectId: containerId },
        search: (prev) => ({ ...prev, node: nodeId }),
      })
    }
    // Desde Sheet hacia Dialog (o viceversa): AppShell ya reacciona solo
    // al cambio de `mode` vía useTaskViewMode(), no hace falta navegar.
  }

  const subtaskCount = subtasks?.length ?? 0
  const doneSubtaskCount = subtasks?.filter((s) => isDoneStatus(s.status?.status_kind)).length ?? 0
  // R4: "cerradas" (hechas O descartadas) es la condición correcta para
  // sugerir cerrar el padre — a diferencia de `doneSubtaskCount` de
  // arriba (solo para la barra de progreso), una subtarea descartada
  // también "ya no queda nada pendiente ahí", aunque no cuente como hecha.
  const closedSubtaskCount = subtasks?.filter((s) => isClosedStatus(s.status?.status_kind)).length ?? 0

  // "Bloqueada por" = esta tarea es la sucesora (alguien más tiene que
  // terminar antes); "Bloquea a" = esta tarea es la predecesora. Mismas
  // filas de task_dependencies, filtradas según de qué lado cae nodeId.
  const blockedBy = (dependencies ?? []).filter((d) => d.successor_id === nodeId)
  const blocks = (dependencies ?? []).filter((d) => d.predecessor_id === nodeId)

  const currentStatus = statuses?.find((s) => s.id === task.status_id)
  const isDone = isDoneStatus(currentStatus?.status_kind)
  const deliveryInfo = formatDeliveryState(task.due_date, isDone, task.completed_at)
  const otherMemberships = task.memberships.length - 1

  // Mismo criterio que TaskCard.tsx/TaskRow.tsx: togglear el encabezado
  // mueve la tarea entre el status "success" y el default del proyecto.
  // A diferencia de board/list, acá no hace falta tocar `position` — el
  // <Select> de estado de esta misma vista ya escribe solo `status_id`.
  function toggleTaskDone() {
    if (!statuses) return
    const doneStatus = statuses.find((s) => s.status_kind === 'success')
    const defaultStatus = statuses.find((s) => s.is_default) ?? statuses[0]
    const target = isDone ? defaultStatus : doneStatus
    if (target) requestStatusChange(target.id)
  }

  // "Cerrar con subtareas abiertas" (decisión de producto aprobada con el
  // usuario) — intercepta CUALQUIER camino que mande la tarea a un estado
  // 'success' (el toggle de arriba Y el <Select> de más abajo), sea al
  // completar por primera vez o al recompletar tras reabrir. Reabrir
  // (target no 'success') nunca pasa por acá con nada especial: sigue de
  // largo, como siempre. Las subtareas "checklist" (sin responsable NI
  // fecha propia) no entran en `pendingWithOwner` — esas se cierran solas
  // en cascada del lado del servidor
  // (trg_close_open_subtasks_on_parent_done, 0081), sin diálogo.
  const pendingWithOwner = (subtasks ?? []).filter(
    (s) => !isClosedStatus(s.status?.status_kind) && (s.assignee_id || s.due_date),
  )

  // R3: la mitad "reabrir" del mismo trigger. Busca la cascada más
  // reciente (activity_log.action = 'subtasks_closed', 0081/0082) y se
  // queda solo con las subtareas que TODAVÍA están tal cual esa cascada
  // las dejó — si alguien ya las tocó a mano desde entonces (las reabrió,
  // les cambió el estado), restaurarlas pisaría ese cambio posterior sin
  // que nadie lo pidiera, así que se excluyen.
  const lastCascade = activity?.find((e) => e.action === 'subtasks_closed') as
    | (ActivityEntry & { payload: { completed?: CascadeSubtask[]; dropped?: CascadeSubtask[] } })
    | undefined
  const restoreCandidates: RestoreCandidate[] = lastCascade
    ? [
        ...(lastCascade.payload.completed ?? []).map((s) => ({ ...s, outcome: 'completed' as const })),
        ...(lastCascade.payload.dropped ?? []).map((s) => ({ ...s, outcome: 'dropped' as const })),
      ]
        .filter((s) => s.previous_status_id)
        .filter((s) => {
          const current = subtasks?.find((sub) => sub.id === s.id)
          if (!current) return false
          const expectedKind = s.outcome === 'completed' ? 'success' : 'dropped'
          return current.status?.status_kind === expectedKind
        })
        .map((s) => ({ id: s.id, title: s.title, outcome: s.outcome }))
    : []

  function requestStatusChange(targetStatusId: string) {
    const targetKind = statuses?.find((s) => s.id === targetStatusId)?.status_kind
    const currentKind = currentStatus?.status_kind
    if (currentKind === 'success' && targetKind !== 'success' && restoreCandidates.length > 0) {
      // Reabriendo (sale de 'success') Y hay algo que ofrecer restaurar.
      setPendingReopenStatusId(targetStatusId)
      setReopenDialogOpen(true)
      return
    }
    if (targetKind !== 'success' || pendingWithOwner.length === 0) {
      updateMutation.mutate({ status_id: targetStatusId })
      return
    }
    setPendingStatusId(targetStatusId)
    setCloseDialogOpen(true)
  }

  async function handleConfirmClose(action: SubtaskCloseAction) {
    if (!pendingStatusId) return
    const doneStatusId = statuses?.find((s) => s.status_kind === 'success')?.id
    const droppedStatusId = statuses?.find((s) => s.status_kind === 'dropped')?.id
    await resolveSubtasksMutation.mutateAsync({
      subtaskIds: pendingWithOwner.map((s) => s.id),
      action,
      statusId: action === 'discard' ? droppedStatusId : action === 'complete' ? doneStatusId : undefined,
    })
    updateMutation.mutate({ status_id: pendingStatusId })
    setCloseDialogOpen(false)
    setPendingStatusId(null)
  }

  // R3: `restore=false` reabre igual la tarea, solo que sin tocar las
  // subtareas — el reopen nunca queda bloqueado por esta pregunta,
  // mismo principio de R1 aplicado al camino inverso.
  async function handleConfirmReopen(restore: boolean) {
    if (!pendingReopenStatusId) return
    if (restore && lastCascade) {
      const restores = [...(lastCascade.payload.completed ?? []), ...(lastCascade.payload.dropped ?? [])]
        .filter((s) => restoreCandidates.some((c) => c.id === s.id) && s.previous_status_id)
        .map((s) => ({ subtaskId: s.id, statusId: s.previous_status_id! }))
      if (restores.length > 0) {
        await restoreSubtasksMutation.mutateAsync({ restores })
      }
    }
    updateMutation.mutate({ status_id: pendingReopenStatusId })
    setReopenDialogOpen(false)
    setPendingReopenStatusId(null)
  }

  return (
    // @container propio: en modo Sheet/Dialog esto se porta fuera de
    // <main> (Radix Portal a document.body), así que no puede depender del
    // @container de AppShell — necesita el suyo para que @min-[...]:
    // reaccione al ancho real del panel (angosto en Sideview aunque la
    // ventana sea ancha), no al del viewport. En modo página completa ya
    // no hay `max-w-2xl`: con dos columnas, un ancho angosto fijo dejaba
    // más de la mitad de la pantalla sin usar. `w-full max-w-[1400px]
    // mx-auto` explícito (en vez de confiar en que un <div> de bloque
    // llene solo a su padre): en monitores muy anchos la columna principal
    // (`minmax(0,1fr)`) se estiraba a un ancho de línea de texto poco
    // legible sin un techo — y de paso deja la página "centrada, dedicada"
    // en vez de pegada al borde izquierdo del panel.
    <div
      className={cn(
        '@container',
        onClose
          ? 'flex h-full flex-col overflow-y-auto p-4 @min-[640px]:p-6'
          : 'mx-auto w-full max-w-[1400px] p-4 @min-[640px]:p-6',
      )}
    >
      {/* flex-wrap en las dos filas, no solo la de afuera — mismo bug y
          mismo fix que ProjectToolbar.tsx: sin el de adentro, el grupo de
          acciones (hasta 5 controles + un <Select>) se envuelve como
          bloque a una segunda línea pero sigue sin quebrar puertas
          adentro, desbordando el panel en mobile. Auditoría mobile. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {/* En la página completa (`!onClose`) este "Volver" se esconde en
            mobile: ahí la cabecera de la app ya trae el atrás, y con el
            nombre de la lista a la que vuelve en vez de la palabra
            "Volver" (Topbar.tsx + use-mobile-back.ts). En escritorio esa
            cabecera contextual no existe, así que el botón sigue siendo el
            único camino de vuelta y se queda. En modo Sheet/Dialog
            (`onClose`) es "Cerrar", no navega a ningún lado y no lo
            reemplaza nadie — siempre visible. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          className={cn(!onClose && 'hidden md:inline-flex')}
        >
          <HugeiconsIcon icon={onClose ? MultiplicationSignIcon : ArrowLeft01Icon} />
          {onClose ? 'Cerrar' : 'Volver'}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {/* Mismo guard que Duplicar (`task.status_id`): una tarea
              personal no tiene proyecto/contenedor, así que no hay
              `/p/:id/t/:id` público que compartir — solo `containerId`
              alcanza acá, pero se repite la condición para agrupar
              visualmente las dos acciones que dependen de "es de
              proyecto". */}
          {task.status_id && containerId && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Compartir tarea"
              title="Compartir tarea"
              onClick={() => {
                const url = `${window.location.origin}/p/${containerId}/t/${nodeId}`
                if (navigator.share) {
                  // Cancelar el picker nativo (AbortError) no es un error
                  // real — nadie más necesita enterarse.
                  navigator.share({ title: task.title, url }).catch(() => {})
                } else {
                  void navigator.clipboard.writeText(url)
                  toast.success('Enlace copiado.')
                }
              }}
            >
              <HugeiconsIcon icon={Share08Icon} />
            </Button>
          )}
          {task.status_id && containerId && (
            // Fase A de "privacidad de tareas y espacios": mismo diálogo
            // que espacios/carpetas/listas, conectado acá para tareas
            // individuales — el modelo (is_private + node_access) nunca
            // estuvo restringido a nivel de columna. Uso esperado: poco
            // frecuente (una lista compartida con el equipo rara vez
            // necesita UNA tarea puntual oculta al resto), por eso vive
            // como ícono chico junto a Compartir/Duplicar, no como algo
            // más prominente.
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Acceso y privacidad"
              title="Acceso y privacidad"
              onClick={() => setAccessDialogOpen(true)}
            >
              <HugeiconsIcon icon={task.is_private ? LockIcon : Globe02Icon} />
            </Button>
          )}
          {task.status_id && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Duplicar tarea"
              title="Duplicar tarea"
              onClick={() =>
                duplicateMutation.mutate(
                  { taskId: nodeId, statusId: task.status_id! },
                  { onSuccess: (newId) => setNode(newId) },
                )
              }
            >
              <HugeiconsIcon icon={Copy01Icon} />
            </Button>
          )}
          {/* F5 #8: guarda título/descripción/prioridad/etiquetas/subtareas
              como plantilla reusable (save_task_as_template,
              0056_templates.sql) — desacoplada de esta tarea, no un
              duplicado inmediato como el botón de arriba. */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Guardar como plantilla"
            title="Guardar como plantilla"
            onClick={() => setTemplateDialogOpen(true)}
          >
            <HugeiconsIcon icon={BookmarkAdd01Icon} />
          </Button>
          <SaveAsTemplateDialog
            open={templateDialogOpen}
            onOpenChange={setTemplateDialogOpen}
            defaultName={task.title}
            isPending={saveAsTemplateMutation.isPending}
            onSave={(name) =>
              saveAsTemplateMutation.mutate(
                { taskId: nodeId, name },
                {
                  onSuccess: () => {
                    toast.success('Plantilla guardada.')
                    setTemplateDialogOpen(false)
                  },
                  onError: () => toast.error('No se pudo guardar la plantilla.'),
                },
              )
            }
          />
          {/* En mobile el modo lo impone el ancho, no la preferencia (ver
              task-view-mode.ts): mostrar un selector de tres opciones de las
              que dos no cambiarían nada sería mentirle a quien lo toque. */}
          {!isViewModeForced && (
            <Select value={viewMode} onValueChange={(v) => handleModeChange(v as TaskViewMode)}>
              <SelectTrigger size="sm" className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['side', 'modal', 'full'] as const).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {VIEW_MODE_LABEL[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Eliminar tarea" onClick={handleDeleteTask}>
            <HugeiconsIcon icon={Delete02Icon} />
          </Button>
        </div>
      </div>

      {/* Encabezado sin tarjeta: toggle circular de completar (mismo
          Checkbox que SubtaskList.tsx/TaskRow.tsx, escalado a size-6 y
          redondo) + título grande + una fila de chips de metadata en vez
          de la vieja grilla de <Select> con label arriba de cada uno. */}
      <div className="mb-6">
        {/* "¿Dónde estoy?" — el panel se abre desde lugares que mezclan
            tareas de proyectos distintos (Mis tareas, Bandeja, Tabla/
            Calendario/Timeline global) sin que el sidebar navegue de
            verdad (el panel flota sobre la página base, la URL no
            cambia de projectId) — hasta ahora la única pista era la fila
            "Lista" bien abajo, en Detalles. Mismo Breadcrumb que ya usa
            ProjectPageHeader.tsx, mismo criterio de armado (ancestros +
            el propio proyecto como último segmento). Auditoría de
            navegación, seguimiento a la corrección del sidebar. */}
        {workspaceId && project && containerId && (
          <div className="mb-2 flex min-w-0 items-center gap-1">
            <Breadcrumb workspaceId={workspaceId} nodeId={containerId} />
            <Link
              to={lastProjectView}
              params={{ projectId: containerId }}
              className="max-w-40 truncate text-xs text-text-secondary hover:underline"
            >
              {project.name}
            </Link>
          </div>
        )}
        {task.parent_id && parentTask && containerId && (
          <Link
            to="/p/$projectId/t/$taskId"
            params={{ projectId: containerId, taskId: task.parent_id }}
            className="mb-2 inline-block rounded-full bg-surface-alt px-2 py-0.5 text-xs text-text-muted hover:underline"
          >
            Subtarea de: {parentTask.title}
          </Link>
        )}
        <div className="mb-3 flex items-start gap-3">
          <Checkbox
            checked={isDone}
            onCheckedChange={toggleTaskDone}
            aria-label={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
            // border-input en modo oscuro es blanco al 15% de opacidad
            // (--input, index.css) — casi invisible sobre el fondo casi
            // negro del tema oscuro. border-strong (#434343) es el mismo
            // tono que ya usan otros controles del panel para notarse sin
            // parecer chequeado.
            className="mt-1.5 size-6 shrink-0 rounded-full border-border-strong"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== task.title) {
                updateMutation.mutate({ title: title.trim() })
              }
            }}
            className={cn(
              'h-auto flex-1 border-transparent bg-transparent px-0 text-2xl font-semibold focus-visible:border-ring focus-visible:bg-bg focus-visible:px-2.5',
              isDone && 'text-text-muted line-through',
            )}
          />
          <TaskPresenceAvatars taskId={nodeId} />
        </div>

        {/* Lista campo/valor (antes: una sola fila flex-wrap con pills,
            avatares y botones de acción todos mezclados — con varios
            asignados se volvía ilegible, y el "responsable principal"
            se mostraba dos veces: acá y en el pool de abajo. Rediseño
            pedido por el usuario, mockup aprobado antes de codear. Cada
            campo vive en su propia fila (ícono + etiqueta fija a la
            izquierda, mismo criterio que Detalles más abajo); agregar
            gente a Asignados solo hace más alta ESA fila, nunca
            empuja ni mezcla las demás. */}
        <div className="ml-9 flex flex-col">
          <MetaRow icon={CheckmarkCircle02Icon} label="Estado">
            <Select
              value={task.status_id ?? undefined}
              onValueChange={requestStatusChange}
            >
              <SelectTrigger
                size="sm"
                className={cn(
                  // `!` fuerza la altura/padding sobre `data-[size=sm]:h-7`
                  // del propio componente base (select.tsx) — sin esto el
                  // trigger quedaba con el tamaño de un botón normal, no
                  // el pill chico y apretado que se ve en cada SelectItem
                  // de abajo (mismo `rounded-full px-2 py-0.5 text-xs`).
                  // La idea es que el control ENTERO sea ese pill, no una
                  // caja más grande que lo contenga.
                  'h-auto! gap-1 rounded-full border-transparent px-2! py-0.5! text-xs! font-medium [&_svg]:size-3',
                  currentStatus && STATUS_KIND_BADGE[currentStatus.status_kind],
                )}
              >
                {/* Children explícitos, no <SelectValue /> vacío: sin
                    hijos, Radix porta acá adentro el contenido completo
                    del SelectItem seleccionado — que también trae su
                    propio pill (ver SelectContent más abajo) — y quedaba
                    un pill adentro de este pill, mismo color, doble
                    padding. Con texto plano el trigger ya es el único
                    pill. */}
                <SelectValue>{currentStatus?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statuses?.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_KIND_BADGE[status.status_kind])}>
                      {status.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MetaRow>

          <MetaRow icon={UserMultiple02Icon} label="Asignados">
            {/* Un solo concepto de "asignado" (antes: este pool +
                el <Select> de assignee_id aparte, mostrando a la misma
                persona dos veces). assignee_id sigue existiendo igual
                para Calendar/recurrencia (0041) — acá solo se marca con
                una estrella sobre su avatar como "responsable principal",
                no tiene control propio; 0041 ya lo promueve/reasigna solo
                al agregar/quitar gente del pool, la estrella de
                ResponsablePicker cubre el resto (cambiarlo a mano entre
                dos personas ya asignadas). Avatares sin onClick a
                propósito (a diferencia de los viejos chips, que se
                quitaban con un click): agregar/quitar asignados queda
                solo en el Popover de abajo, con checkbox explícito — un
                click directo sobre un avatar de 24px es fácil de
                disparar por accidente, mala idea pensando en gente no
                habituada a la herramienta. */}
            {task.task_assignees.length > 0 && (
              <AvatarGroup>
                {task.task_assignees.slice(0, 4).map((a) => (
                  <div
                    key={a.user_id}
                    title={`${a.assignee?.full_name ?? a.user_id}${task.assignee_id === a.user_id ? ' · responsable principal' : ''}`}
                    className="relative"
                  >
                    <Avatar size="sm">
                      {a.assignee?.avatar_url && <AvatarImage src={a.assignee.avatar_url} alt="" />}
                      <AvatarFallback>{initials(a.assignee?.full_name)}</AvatarFallback>
                    </Avatar>
                    {task.assignee_id === a.user_id && (
                      <HugeiconsIcon
                        icon={StarIcon}
                        className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full fill-accent-2 text-accent-2 ring-2 ring-surface"
                      />
                    )}
                  </div>
                ))}
                {task.task_assignees.length > 4 && (
                  <AvatarGroupCount>+{task.task_assignees.length - 4}</AvatarGroupCount>
                )}
              </AvatarGroup>
            )}
            {workspaceId && (
              <ResponsablePicker
                workspaceId={workspaceId}
                projectId={containerId}
                taskId={nodeId}
                assignedMembers={task.task_assignees}
                principalId={task.assignee_id}
                compact
              />
            )}
            {task.task_assignees.length > 0 && (
              <span className="min-w-0 truncate text-xs text-text-secondary">
                {task.task_assignees.length === 1
                  ? task.task_assignees[0]?.assignee?.full_name
                  : `${task.task_assignees[0]?.assignee?.full_name?.split(' ')[0] ?? ''} y ${task.task_assignees.length - 1} más`}
              </span>
            )}
          </MetaRow>

          <MetaRow icon={Calendar01Icon} label="Fechas">
            {deliveryInfo && (
              <span className={cn('flex flex-wrap items-center gap-1 text-xs font-medium', DELIVERY_STATE_CLASS[deliveryInfo.state])}>
                {deliveryInfo.label}
                {deliveryInfo.detail && <span className="font-normal text-text-muted">· {deliveryInfo.detail}</span>}
              </span>
            )}
            {/* `is_milestone` solo se podía fijar al crear la tarea ("+ Tarea"
                → "Hito", o import CSV) — este botón cierra ese hueco.
                Mismo ícono que usa el Gantt para pintar hitos
                (GanttRow.tsx), así que el rombo ya es un lenguaje visual
                conocido en el resto de la app. */}
            <button
              type="button"
              onClick={() => updateMutation.mutate({ is_milestone: !task.is_milestone })}
              aria-label={task.is_milestone ? 'Quitar hito' : 'Marcar como hito'}
              title={task.is_milestone ? 'Quitar hito' : 'Marcar como hito'}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-surface-alt',
                task.is_milestone ? 'text-accent' : 'text-text-muted hover:text-text',
              )}
            >
              <HugeiconsIcon icon={Diamond01Icon} className="size-3.5" />
            </button>
            <TaskDateRangePicker
              startDate={task.start_date}
              dueDate={task.due_date}
              startTime={task.start_time}
              dueTime={task.due_time}
              recurrence={recurrenceQuery.data ?? null}
              disableRecurrence={task.parent_id !== null}
              onDatesChange={(fields) => updateMutation.mutate(fields)}
              onRecurrenceChange={(rule) => recurrenceMutation.mutate(rule)}
              renderTrigger={(openPicker) => (
                <button
                  type="button"
                  onClick={openPicker}
                  aria-label="Editar fechas"
                  title="Editar fechas"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt hover:text-text"
                >
                  <HugeiconsIcon icon={Edit02Icon} className="size-3.5" />
                </button>
              )}
            />
          </MetaRow>

          <MetaRow icon={Flag01Icon} label="Prioridad">
            <Select value={task.priority} onValueChange={(priority) => updateMutation.mutate({ priority })}>
              <SelectTrigger
                size="sm"
                className={cn(
                  // Mismo criterio que el trigger de Estado: el control
                  // entero debe verse como el pill chico de cada
                  // SelectItem, no como una caja más grande que lo
                  // contiene.
                  'h-auto! gap-1 rounded-full border-transparent px-2! py-0.5! text-xs! font-medium [&_svg]:size-3',
                  PRIORITY_BADGE[task.priority],
                )}
              >
                {/* Mismo motivo que el trigger de Estado más arriba: texto
                    plano, no el pill del SelectItem duplicado adentro. */}
                <SelectValue>{PRIORITY_LABEL[task.priority]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_BADGE[p])}>
                      {PRIORITY_LABEL[p]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MetaRow>

          <MetaRow icon={Tag01Icon} label="Etiquetas">
            {task.task_labels.map(({ label }) => (
              <span
                key={label.id}
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: label.color ?? undefined }}
              >
                {label.name}
              </span>
            ))}
            {workspaceId && (
              <LabelPicker
                workspaceId={workspaceId}
                task={{ projectId: containerId, taskId: nodeId, assignedLabels: task.task_labels.map((tl) => tl.label) }}
                compact
              />
            )}
          </MetaRow>

          <MetaRow icon={CircleArrowLeft01Icon} label="Bloqueada por">
            {blockedBy.map((d) => (
              <DependencyChip key={d.id} task={d.predecessor} onRemove={() => removeDependencyMutation.mutate(d.id)} />
            ))}
            {containerId && (
              <TaskDependencyPicker
                containerId={containerId}
                excludeIds={[nodeId, ...blockedBy.map((d) => d.predecessor_id)]}
                onSelect={(otherId) =>
                  addDependencyMutation.mutate({ predecessorId: otherId, successorId: nodeId })
                }
              />
            )}
          </MetaRow>

          <MetaRow icon={CircleArrowRight01Icon} label="Bloquea a">
            {blocks.map((d) => (
              <DependencyChip key={d.id} task={d.successor} onRemove={() => removeDependencyMutation.mutate(d.id)} />
            ))}
            {containerId && (
              <TaskDependencyPicker
                containerId={containerId}
                excludeIds={[nodeId, ...blocks.map((d) => d.successor_id)]}
                onSelect={(otherId) =>
                  addDependencyMutation.mutate({ predecessorId: nodeId, successorId: otherId })
                }
              />
            )}
          </MetaRow>

          <MetaRow icon={MoreHorizontalIcon} label="Extras">
            {/* Acciones secundarias — un clic, pero no compiten por
                atención con los valores de arriba (Estado/Fechas/etc.):
                sin fondo/borde propio, ícono+texto más chico. */}
            <div className="-ml-2 flex flex-wrap items-center gap-0.5 text-text-muted [&_button]:text-inherit [&_svg]:size-3.5">
              <WatchToggle taskId={nodeId} userId={session?.user.id} />
              {workspaceId && <ReviewerPicker workspaceId={workspaceId} taskId={nodeId} reviewers={reviewers ?? []} />}
              <TimeTrackingPopover nodeId={nodeId} />
            </div>
          </MetaRow>
        </div>
      </div>

      {/* Dos columnas vía el @container ya declarado arriba — bajo
          ~900px de panel (Sideview/modal angostos) colapsa a una sola
          columna, igual que antes de este cambio. */}
      <div className="grid grid-cols-1 gap-6 @min-[900px]:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <Label className="mb-1.5 block text-text-muted">Descripción</Label>
            <TaskDescriptionEditor
              content={task.description ?? ''}
              onSave={(html) => updateMutation.mutate({ description: html })}
            />
          </div>

          {task.parent_id === null && containerId && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-text">Subtareas</h2>
                {subtaskCount > 0 && (
                  <span className="flex items-center gap-1.5 font-mono text-xs text-text-muted">
                    <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-alt">
                      <span
                        className="block h-full rounded-full bg-success"
                        style={{ width: `${Math.round((doneSubtaskCount / subtaskCount) * 100)}%` }}
                      />
                    </span>
                    {doneSubtaskCount}/{subtaskCount}
                  </span>
                )}
              </div>

              {/* R4: sugerencia, nunca cierre automático — el propio
                  artifact aprobado marca el auto-cierre como el modo de
                  falla exacto que esta decisión entera busca evitar
                  (completar en falso). Solo una propuesta con un botón,
                  descartable. */}
              {subtaskCount > 0 && closedSubtaskCount === subtaskCount && !isClosedStatus(currentStatus?.status_kind) && !suggestCloseDismissed && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-accent-text-on-bg">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 shrink-0" />
                  <span className="flex-1">Ya no queda ninguna subtarea abierta. ¿Marcamos esta tarea como hecha?</span>
                  <Button
                    size="sm"
                    variant="outline"
                    // `--accent-text` no existe como token (index.css solo
                    // define `--accent-text-on-bg`, pensado justo para
                    // texto sobre `bg-accent-soft`) — sin él, el `outline`
                    // de Button quedaba con su bg/texto por defecto
                    // (`bg-background`/`foreground`), ilegible sobre este
                    // fondo teñido. Reportado por el usuario.
                    className="h-6 shrink-0 border-accent/40 bg-transparent text-accent-text-on-bg hover:bg-accent-soft hover:text-accent-text-on-bg px-2 text-[11px]"
                    onClick={() => {
                      const doneStatus = statuses?.find((s) => s.status_kind === 'success')
                      if (doneStatus) requestStatusChange(doneStatus.id)
                    }}
                  >
                    Marcar como hecha
                  </Button>
                  <button
                    type="button"
                    aria-label="Descartar sugerencia"
                    onClick={() => setSuggestCloseDismissed(true)}
                    className="shrink-0 text-accent-text-on-bg/70 hover:text-accent-text-on-bg"
                  >
                    <HugeiconsIcon icon={MultiplicationSignIcon} className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Espejo del banner de arriba: el padre ya está cerrado
                  pero quedó (o quedó de nuevo) una subtarea abierta por
                  debajo — mismo tono neutro (no accent: acá no se está
                  proponiendo la resolución "natural" del progreso, se
                  está señalando una inconsistencia) y misma regla de
                  nunca actuar solo. */}
              {hasOrphanOpenSubtask && !orphanSubtaskDismissed && (
                // --accent-2 (ámbar) es el mismo tono que ya usa
                // DELIVERY_STATE_CLASS más abajo para "necesita atención,
                // sin ser la alarma roja de 'overdue'" — no existe un
                // token `--warning` en index.css (mismo error que el
                // banner de arriba antes de corregirlo), así que se
                // reusa el par que sí está definido para este matiz.
                <div className="mb-3 flex items-center gap-2 rounded-md border border-accent-2/30 bg-accent-2-bg px-3 py-2 text-xs text-accent-2-text-on-bg">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 shrink-0" />
                  <span className="flex-1">
                    Esta tarea está {currentStatus?.status_kind === 'dropped' ? 'descartada' : 'hecha'}, pero todavía
                    tiene una subtarea abierta. ¿Reabrimos la tarea?
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 border-accent-2/40 bg-transparent px-2 text-[11px] text-accent-2-text-on-bg hover:bg-accent-2-bg hover:text-accent-2-text-on-bg"
                    onClick={() => {
                      const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]
                      if (defaultStatus) requestStatusChange(defaultStatus.id)
                    }}
                  >
                    Reabrir
                  </Button>
                  <button
                    type="button"
                    aria-label="Descartar aviso"
                    onClick={() => setOrphanSubtaskDismissed(true)}
                    className="shrink-0 text-accent-2-text-on-bg/70 hover:text-accent-2-text-on-bg"
                  >
                    <HugeiconsIcon icon={MultiplicationSignIcon} className="size-3.5" />
                  </button>
                </div>
              )}

              <SubtaskList
                projectId={containerId}
                parentTaskId={nodeId}
                statuses={statuses ?? []}
                parentAssignees={task.task_assignees}
              />
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold text-text">Actividad y comentarios</h2>
            <ActivityCommentThread
              taskId={nodeId}
              workspaceId={workspaceId ?? ''}
              statuses={statuses ?? []}
              members={members ?? []}
            />
            {session?.user && (
              <div className="mt-3">
                <CommentForm
                  taskId={nodeId}
                  authorId={session.user.id}
                  // El email era lo único a mano sin otra query — no es
                  // el nombre real, la fila optimista de un comentario
                  // nuevo mostraba el email hasta que llegaba la
                  // respuesta del servidor (mismo bug ya corregido en
                  // TimeTrackingPopover/ActivityCommentThread). members
                  // ya está cargado acá arriba para ActivityCommentThread.
                  authorLabel={members?.find((m) => m.user_id === session.user.id)?.profile?.full_name ?? session.user.email ?? 'Tú'}
                  workspaceId={workspaceId ?? ''}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <ReviewerApprovalBar taskId={nodeId} userId={session?.user.id} />

          <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
            <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">
              Detalles
            </h3>
            <dl className="flex flex-col gap-2 text-xs">
              {project && containerId && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-text-muted">Lista</dt>
                  <dd>
                    <Link
                      to={lastProjectView}
                      params={{ projectId: containerId }}
                      className="flex items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-text-secondary hover:underline"
                    >
                      <HugeiconsIcon icon={Folder02Icon} className="size-3" />
                      {project.name}
                    </Link>
                  </dd>
                </div>
              )}
              {otherMemberships > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-text-muted">También en</dt>
                  <dd className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent">
                    +{otherMemberships} espacio{otherMemberships === 1 ? '' : 's'}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="text-text-muted">Creado por</dt>
                <dd className="text-text-secondary">{task.creator?.full_name ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-text-muted">Creada el</dt>
                <dd className="text-text-secondary">
                  {formatNumericDate(task.created_at, preferenceProfile?.date_format ?? 'dd/MM/yyyy')}
                </dd>
              </div>
            </dl>
          </div>

          {containerId && <CustomFieldInputs projectId={containerId} taskId={nodeId} />}

          <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
            <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">
              Adjuntos
            </h3>
            <AttachmentList nodeId={nodeId} currentUserId={session?.user.id} />
          </div>
        </div>
      </div>

      <CloseWithSubtasksDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        parentTitle={task.title}
        pendingSubtasks={pendingWithOwner}
        pending={resolveSubtasksMutation.isPending}
        onConfirm={handleConfirmClose}
      />

      <RestoreSubtasksDialog
        open={reopenDialogOpen}
        onOpenChange={(next) => {
          setReopenDialogOpen(next)
          // Cerrar con la X/Escape es lo mismo que "No, dejarlas así": la
          // tarea igual queda pendiente de reabrir con el status_id que se
          // eligió — sin este fallback, cerrar el diálogo sin elegir un
          // botón dejaba el <Select> de Estado desincronizado (mostrando
          // el estado viejo aunque el usuario ya haya "elegido" el nuevo).
          if (!next && pendingReopenStatusId) void handleConfirmReopen(false)
        }}
        parentTitle={task.title}
        candidates={restoreCandidates}
        pending={restoreSubtasksMutation.isPending}
        onConfirm={handleConfirmReopen}
      />

      {containerId && accessDialogOpen && (
        <NodeAccessDialog
          nodeId={nodeId}
          nodeName={task.title}
          kind="task"
          isPrivate={task.is_private}
          open={accessDialogOpen}
          onOpenChange={setAccessDialogOpen}
        />
      )}
    </div>
  )
}

// 'overdue' (sigue abierta, atrasada) es la única alarma real — se
// mantiene el rojo de siempre. 'today' y 'late' comparten el ámbar del
// acento secundario (ya usado para prioridad alta): "vence hoy" pide
// atención pronto, "entregada tarde" es dato histórico, ninguna de las
// dos es tan urgente como "sigue vencida". 'ontime'/'upcoming' quedan en
// texto muted, sin alarmar.
const DELIVERY_STATE_CLASS: Record<DeliveryState, string> = {
  overdue: 'text-danger-text',
  today: 'text-accent-2-text-on-bg',
  late: 'text-accent-2-text-on-bg',
  ontime: 'text-success-text',
  upcoming: 'text-text-secondary',
}

// Un lado de una fila de task_dependencies — "Bloqueada por" pasa el
// `predecessor`, "Bloquea a" pasa el `successor` (ver los dos MetaRow de
// arriba). Sin `container_id` (la otra tarea es una subtarea, sin fila en
// node_memberships) se muestra el título sin link: no hay a dónde
// navegar.
function DependencyChip({
  task,
  onRemove,
}: {
  task: { id: string; title: string; container_id: string | null } | null
  onRemove: () => void
}) {
  if (!task) return null
  return (
    <span className="inline-flex max-w-[11rem] items-center gap-1 rounded-full border border-border bg-surface-alt py-0.5 pr-1 pl-2 text-xs">
      {task.container_id ? (
        <Link
          to="/p/$projectId/t/$taskId"
          params={{ projectId: task.container_id, taskId: task.id }}
          className="truncate hover:underline"
        >
          {task.title}
        </Link>
      ) : (
        <span className="truncate">{task.title}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar dependencia con "${task.title}"`}
        className="flex size-3.5 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-danger"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
      </button>
    </span>
  )
}

// Fila campo/valor: ícono + etiqueta fija a la izquierda (muted, mismo
// tamaño en las 6 filas), valor a la derecha. Reemplaza la vieja fila
// flex-wrap única (chips y botones de acción mezclados sin distinción
// visual) — con esto, agregar gente a "Asignados" solo hace más alta
// ESA fila, nunca empuja ni se mezcla con "Fechas"/"Prioridad". Mismo
// criterio de "campo: valor" que ya usa PanelRow en people/PersonPanel.tsx,
// adaptado a una grilla de 2 columnas en vez de una sola línea.
function MetaRow({
  icon,
  label,
  children,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]['icon']
  label: string
  children: React.ReactNode
}) {
  return (
    // 1 columna por defecto (etiqueta arriba, valor abajo), 2 recién desde
    // los 300px de contenedor del propio panel — no @min-[640px] como el
    // resto del archivo: a 112px fijos de la etiqueta + el resto para el
    // valor, 300px ya alcanza cómodo, y a 390px de Sheet esto YA se veía
    // bien (auditoría mobile: hallazgo Bajo, solo defensivo para pantallas
    // más angostas todavía).
    <div className="grid grid-cols-1 items-center gap-x-3 gap-y-1 border-b border-border/60 py-2.5 last:border-b-0 @min-[300px]:grid-cols-[112px_1fr]">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <HugeiconsIcon icon={icon} className="size-3.5 shrink-0" />
        {label}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}
