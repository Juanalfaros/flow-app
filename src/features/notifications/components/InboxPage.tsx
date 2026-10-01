import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  InboxIcon,
  CheckmarkCircle02Icon,
  UserAdd01Icon,
  ArrowRight01Icon,
  Comment01Icon,
  AtSignIcon,
  ViewIcon,
  CircleUnlock01Icon,
  AlarmClockIcon,
  UserRemove01Icon,
  UserSwitchIcon,
  Rocket01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useProjects, workspaceStatusesQueryOptions } from '@/features/projects/queries'
import { useNotifications, type NotificationRow, type NotificationType } from '@/features/notifications/queries'
import { useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } from '@/features/notifications/mutations'
import { describeNotification } from '@/features/notifications/describe'
import { useInboxSplitPane } from '@/features/notifications/use-inbox-split-pane'
import { NodeDetailContent } from '@/features/tasks/components/NodeDetailContent'
import { formatRelativeTime } from '@/lib/format-date'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

// Ícono + color por tipo de notificación — se escanea la bandeja por
// forma/color antes de leer una palabra. El de "mención" no tiene un
// equivalente Hugeicons confirmado contra un mockup previo; `AtSignIcon`
// es la elección más directa disponible en el set.
const TYPE_BADGE: Record<NotificationType, { icon: IconSvgElement; className: string }> = {
  assigned: { icon: UserAdd01Icon, className: 'bg-warn-bg text-warn-text' },
  status_changed: { icon: ArrowRight01Icon, className: 'bg-status-inreview-bg text-status-inreview' },
  comment: { icon: Comment01Icon, className: 'bg-surface-alt text-text-muted' },
  mention: { icon: AtSignIcon, className: 'bg-accent-soft text-accent' },
  watched_activity: { icon: ViewIcon, className: 'bg-surface-alt text-text-muted' },
  unblocked: { icon: CircleUnlock01Icon, className: 'bg-success-bg text-success-text' },
  due_reminder: { icon: AlarmClockIcon, className: 'bg-danger/10 text-danger' },
  // Los 3 tipos de 0076 — sin tarea (n.node siempre null para estos).
  removed_from_workspace: { icon: UserRemove01Icon, className: 'bg-danger/10 text-danger' },
  role_changed: { icon: UserSwitchIcon, className: 'bg-accent-2-bg text-accent-2-text-on-bg' },
  welcome: { icon: Rocket01Icon, className: 'bg-success-bg text-success-text' },
  // Decisión de producto "Cerrar con subtareas abiertas" (0081) — mismo
  // color que el estado Descartado (status-kind.ts), coherente con el
  // desenlace real de la subtarea.
  subtask_resolved: { icon: Delete02Icon, className: 'bg-status-dropped-bg text-status-dropped' },
  // D2 ("Quién queda a cargo al crear", A5+A7) — mismo ícono que
  // "assigned" (ganar un responsable es ganar un responsable, mire quien
  // lo mire) pero con un color propio para no confundirse con esa: acá
  // el destinatario es quien PIDIÓ la tarea, no quien la ejecuta.
  task_claimed: { icon: UserAdd01Icon, className: 'bg-status-inprogress-bg text-status-inprogress' },
}

// Filtros del panel de Bandeja (rediseño de navegación) — "unread"/"all"
// ya existían como pestañas locales; "mention"/"assigned"/
// "watched_activity" son los 3 tipos de NotificationType que tienen
// sentido como atajo propio (equivalentes 1:1 a un tipo real, sin
// inventar ningún estado nuevo — a diferencia de "Archivadas", que el
// sidebar deja como "Pronto" porque no existe esa columna todavía).
export type InboxFilter = 'unread' | 'all' | 'mention' | 'assigned' | 'watched_activity'

const FILTER_LABEL: Record<InboxFilter, string> = {
  unread: 'No leídas',
  all: 'Todas',
  mention: 'Menciones',
  assigned: 'Asignadas a mí',
  watched_activity: 'Siguiendo',
}

function filterNotifications(notifications: NotificationRow[], filter: InboxFilter): NotificationRow[] {
  switch (filter) {
    case 'unread':
      return notifications.filter((n) => !n.read_at)
    case 'all':
      return notifications
    default:
      return notifications.filter((n) => n.type === filter)
  }
}

interface InboxPageProps {
  workspaceId: string
  userId: string | undefined
  filter: InboxFilter
  onFilterChange: (filter: InboxFilter) => void
  /** Id de la TAREA (no de la notificación) mostrada en el panel de
   * detalle — `null` cuando no hay ninguna abierta. Vive en la URL
   * (`?open=`, ver bandeja.tsx), no acá: así el panel sobrevive a una
   * recarga y un link directo a "esta notificación" es compartible. */
  openTaskId: string | null
  onOpenTaskChange: (taskId: string | null) => void
}

export function InboxPage({ workspaceId, userId, filter, onFilterChange, openTaskId, onOpenTaskChange }: InboxPageProps) {
  // Una sola query (sin `unreadOnly`): las 5 pestañas se derivan
  // client-side de esta misma lista — ver filterNotifications arriba.
  const { data: notifications } = useNotifications(userId)
  const { data: projects } = useProjects(workspaceId)
  const projectIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])
  const { data: statuses } = useQuery(workspaceStatusesQueryOptions(projectIds))
  const statusesById = useMemo(() => new Map((statuses ?? []).map((s) => [s.id, { name: s.name }])), [statuses])
  const unreadCount = useMemo(() => (notifications ?? []).filter((n) => !n.read_at).length, [notifications])

  const markReadMutation = useMarkNotificationReadMutation(userId)
  const markAllReadMutation = useMarkAllNotificationsReadMutation(userId)

  // Decisión 3 de la auditoría de layout: en un monitor ancho, el detalle
  // de la tarea vive AL LADO de la lista (nunca la tapa) en vez de que
  // cada clic navegue lejos de la bandeja — revisar 20 notificaciones
  // pasa a ser bajar por la lista, no abrir y cerrar 20 páginas. Por
  // debajo del umbral (y en mobile) sigue siendo la navegación de
  // siempre — ver use-inbox-split-pane.ts para el porqué del corte en JS
  // y no en CSS.
  const showSplitPane = useInboxSplitPane()
  const showDetail = showSplitPane && !!openTaskId

  return (
    // `prose` hasta que el panel de detalle puede aparecer, `app` recién
    // ahí: el ancho ancho (1400px) se justifica por tener DOS columnas que
    // llenar — sin el panel (por debajo de @min-[1440px], o con el panel
    // cerrado) es una lista de una sola columna, y `app` la estiraba a
    // ~1350px de contenido sin nada que llenara ese espacio — mismo error
    // que ya se había evitado en list.tsx, reintroducido acá por reasignar
    // el ancho (PR #123) antes de que el layout que lo justifica existiera
    // (PR #125). Mismo hook que ya decide el panel, así que los dos
    // cambian juntos siempre — no hay forma de que se desincronicen.
    <PageShell width={showSplitPane ? 'app' : 'prose'}>
      <div className="flex items-center justify-between">
        {/* En escritorio el panel del sidebar (BandejaPanel.tsx) YA es la
            navegación entre filtros — plan de corrección de layout,
            Corrección 2. Con las pestañas escondidas ahí (`md:hidden` más
            abajo), el título deja de poder decir siempre "Bandeja de
            entrada": pasa a nombrar el filtro activo, que es lo único que
            en escritorio ya no se ve en ningún otro lado de esta pantalla.
            En mobile (sin panel) las pestañas siguen a la vista, así que
            el título se queda genérico — nombrar el filtro sería
            redundante con la pestaña ya resaltada debajo. */}
        <h1 className="text-lg font-medium">
          <span className="md:hidden">Bandeja de entrada</span>
          <span className="hidden md:inline">{FILTER_LABEL[filter]}</span>
        </h1>
        <Button variant="ghost" size="sm" onClick={() => markAllReadMutation.mutate()} disabled={!unreadCount}>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
          Marcar todas como leídas
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => onFilterChange(v as InboxFilter)}>
        {/* `md:hidden`: las 5 pestañas repiten exactamente lo que
            BandejaPanel.tsx ya ofrece en el sidebar desde `md:` en
            adelante (mismos 5 filtros, mismo <InboxFilter>) — confirmado
            leyendo ese panel antes de tocar esto. El componente `Tabs`
            sigue envolviendo todo (TabsList y los TabsContent necesitan
            compartir su contexto), solo se esconde la fila de botones. */}
        <TabsList className="md:hidden">
          {(Object.keys(FILTER_LABEL) as InboxFilter[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {FILTER_LABEL[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* La fila (`gap-4`) solo separa lista/detalle cuando el detalle
            existe de verdad — sin `showDetail`, la lista sigue ocupando
            el ancho completo de siempre, no un `max-w-md` huérfano
            esperando un panel que nunca llega. */}
        <div className="flex items-start gap-4">
          <div className={cn('min-w-0 flex-1', showDetail && 'max-w-md shrink-0 flex-none')}>
            {(Object.keys(FILTER_LABEL) as InboxFilter[]).map((key) => (
              <TabsContent key={key} value={key}>
                <NotificationList
                  notifications={notifications && filterNotifications(notifications, key)}
                  statusesById={statusesById}
                  onMarkRead={(id) => markReadMutation.mutate(id)}
                  showSplitPane={showSplitPane}
                  activeTaskId={openTaskId}
                  onOpenTask={onOpenTaskChange}
                />
              </TabsContent>
            ))}
          </div>

          {showDetail && (
            // `sticky top-4`: mismo patrón que el rail de profile.tsx — se
            // queda a la vista mientras se scrollea una lista larga, sin
            // necesitar un alto fijo ni un cálculo de viewport que acá no
            // se puede verificar sin navegador. `key`: fuerza remount al
            // cambiar de tarea (B-04, mismo motivo que AppShell.tsx).
            //
            // Sin `overflow-hidden`: NodeDetailContent monta selects,
            // popovers y tooltips propios — algunos no van por portal.
            //
            // border-l pl-4, no tarjeta (ronda 2 del plan de corrección de
            // layout, 2026-09-24): error de la ronda 1 — la tabla "La
            // regla" del plan llamó a esto "lista de notificaciones" por
            // error, cuando es el panel de detalle, y se quedó sin tocar.
            // Mismo criterio que el resto de Corrección 3: <main> ya es la
            // caja, esto es una columna al lado de otra, separada por una
            // línea, no una tarjeta propia.
            <div className="sticky top-4 min-w-0 flex-1 self-start border-l border-border pl-4">
              <NodeDetailContent key={openTaskId} nodeId={openTaskId!} onClose={() => onOpenTaskChange(null)} />
            </div>
          )}
        </div>
      </Tabs>
    </PageShell>
  )
}

interface DayGroup {
  label: string
  items: NotificationRow[]
}

// `notifications` ya llega ordenada por `created_at desc` (ver
// notificationsQueryOptions) — agrupar con un Map preserva ese orden sin
// necesidad de volver a ordenar.
function groupByDay(notifications: NotificationRow[]): DayGroup[] {
  const groups = new Map<string, NotificationRow[]>()
  for (const n of notifications) {
    const key = format(parseISO(n.created_at), 'yyyy-MM-dd')
    const bucket = groups.get(key)
    if (bucket) bucket.push(n)
    else groups.set(key, [n])
  }
  // Cada bucket del Map siempre tiene >=1 elemento (recién empujado arriba),
  // pero noUncheckedIndexedAccess no puede saberlo — de ahí el filter.
  return [...groups.values()]
    .map((items) => {
      const first = items[0]
      if (!first) return null
      const date = parseISO(first.created_at)
      const label = isToday(date) ? 'Hoy' : isYesterday(date) ? 'Ayer' : format(date, "d 'de' MMMM", { locale: es })
      return { label, items }
    })
    .filter((g): g is DayGroup => g !== null)
}

function NotificationList({
  notifications,
  statusesById,
  onMarkRead,
  showSplitPane,
  activeTaskId,
  onOpenTask,
}: {
  notifications: NotificationRow[] | undefined
  statusesById: Map<string, { name: string }>
  onMarkRead: (id: string) => void
  /** true desde @min-[1440px] — ver use-inbox-split-pane.ts. */
  showSplitPane: boolean
  activeTaskId: string | null
  onOpenTask: (taskId: string) => void
}) {
  if (notifications === undefined) return null
  if (notifications.length === 0) {
    // Plan de corrección de layout (2026-09-24), Corrección 3: sin marco
    // punteado — ícono y texto centrados, igual que el resto de los
    // vacíos de la app.
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <HugeiconsIcon icon={InboxIcon} className="size-6 text-text-muted/60" />
        <p className="text-sm text-text-muted">Nada por acá.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {groupByDay(notifications).map((group) => (
        <div key={group.label}>
          <div className="px-2 pt-3 pb-1 font-mono text-[11px] tracking-wide text-text-muted uppercase">
            {group.label}
          </div>
          {/* divide-y: Corrección 3 — filas con divisor en vez de separadas
              por aire, mismo criterio que el resto de las listas planas
              de esta corrección. */}
          <ul className="flex flex-col divide-y divide-border">
            {group.items.map((n) => (
              <NotificationRowItem
                key={n.id}
                notification={n}
                statusesById={statusesById}
                onMarkRead={onMarkRead}
                showSplitPane={showSplitPane}
                active={showSplitPane && n.node?.id === activeTaskId}
                onOpenTask={onOpenTask}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function NotificationRowItem({
  notification: n,
  statusesById,
  onMarkRead,
  showSplitPane,
  active,
  onOpenTask,
}: {
  notification: NotificationRow
  statusesById: Map<string, { name: string }>
  onMarkRead: (id: string) => void
  showSplitPane: boolean
  /** Esta fila es la que está abierta en el panel de detalle ahora mismo. */
  active: boolean
  onOpenTask: (taskId: string) => void
}) {
  const [markedByClick, setMarkedByClick] = useState(false)
  const projectId = n.node?.memberships[0]?.container_id
  const isUnread = !n.read_at && !markedByClick
  const typeBadge = TYPE_BADGE[n.type]

  const content = (
    <>
      <span className="relative shrink-0">
        <Avatar size="sm">
          {n.actor?.avatar_url && <AvatarImage src={n.actor.avatar_url} alt="" />}
          <AvatarFallback>{initials(n.actor?.full_name ?? null)}</AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border-2 border-bg',
            typeBadge.className,
          )}
        >
          <HugeiconsIcon icon={typeBadge.icon} className="size-2.5" />
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{describeNotification(n, { statusesById })}</span>
        <span className="truncate text-xs text-text-muted">{n.node?.title ?? 'Flow'}</span>
      </div>
      <span className="shrink-0 self-start font-mono text-[10px] whitespace-nowrap text-text-muted">
        {formatRelativeTime(n.created_at)}
      </span>
    </>
  )

  return (
    <li
      className={cn(
        // min-h-13 (52px): la fila trae dos líneas de texto y un avatar, y
        // entera es tocable — el alto de fila del prototipo. `active:`
        // porque en táctil no hay hover que dé feedback del toque.
        'flex min-h-13 items-center gap-2 rounded-md px-2 py-2 transition-colors active:bg-surface-alt hover:bg-surface-alt',
        isUnread && 'bg-accent-soft/40',
        // La fila cuyo detalle está abierto en el panel de al lado se
        // marca igual que "seleccionado" en cualquier otra lista de esta
        // app (TaskRow.tsx: `selected && 'bg-accent-soft'`) — sin esto,
        // con la lista y el detalle visibles a la vez no había forma de
        // saber A CUÁL fila correspondía lo que se estaba mirando.
        active && 'bg-accent-soft/70 hover:bg-accent-soft/70',
      )}
    >
      {isUnread && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
      {projectId && n.node ? (
        showSplitPane ? (
          // Panel al lado en vez de navegar: un <button>, no un <Link> — a
          // este ancho, salir de Bandeja para ver la tarea es exactamente
          // el comportamiento que esta variante reemplaza. Por debajo del
          // umbral (rama de abajo) sigue siendo un <Link> real, con todo
          // lo que eso da gratis (abrir en pestaña nueva, arrastrar el
          // link, etc.) — acá se pierde a propósito, porque la tarea ya
          // está a la vista sin necesidad de nada de eso.
          <button
            type="button"
            onClick={() => {
              setMarkedByClick(true)
              onMarkRead(n.id)
              onOpenTask(n.node!.id)
            }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {content}
          </button>
        ) : (
          <Link
            to="/p/$projectId/t/$taskId"
            params={{ projectId, taskId: n.node.id }}
            onClick={() => {
              setMarkedByClick(true)
              onMarkRead(n.id)
            }}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            {content}
          </Link>
        )
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{content}</div>
      )}
      {isUnread && (
        <button
          type="button"
          aria-label="Marcar como leída"
          onClick={() => {
            setMarkedByClick(true)
            onMarkRead(n.id)
          }}
          className="grid size-9 shrink-0 place-items-center rounded-md text-text-muted transition-colors active:bg-surface-alt hover:bg-surface-alt hover:text-text"
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
        </button>
      )}
    </li>
  )
}
