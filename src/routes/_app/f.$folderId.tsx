import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckListIcon, Folder02Icon, FolderAddIcon, ChevronRightIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { useCurrentWorkspace, useWorkspaceMembers } from '@/features/workspace/queries'
import { useNodeTree, useNodeDetail } from '@/features/nodes/queries'
import { buildTree, collectDescendantProjectIds, type TreeNode } from '@/features/nodes/build-tree'
import { useUpdateNodeDescriptionMutation } from '@/features/nodes/mutations'
import { useSubtreeTasks, type TaskSummary } from '@/features/tasks/queries'
import { workspaceStatusesQueryOptions, type StatusSummary } from '@/features/projects/queries'
import { useSubtreeActivity } from '@/features/activity/queries'
import { ActivityFeed } from '@/features/activity/components/ActivityFeed'
import { isDoneStatus } from '@/features/projects/status-kind'
import { TaskDescriptionEditor } from '@/features/tasks/components/TaskDescriptionEditor'
import { AttachmentList } from '@/features/attachments/components/AttachmentList'
import { NewProjectDialog } from '@/features/projects/components/NewProjectDialog'
import { NewFolderDialog } from '@/features/nodes/components/NewFolderDialog'
import { MobileCreateMenu } from '@/components/layout/MobileCreateMenu'
import { Button } from '@/components/ui/button'
import { NodeIconSwatch } from '@/features/nodes/components/NodeIconSwatch'
import { Breadcrumb } from '@/features/nodes/components/Breadcrumb'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getNodeAppearance } from '@/features/nodes/types'
import { formatDueDate } from '@/lib/format-date'
import { ErrorState } from '@/components/layout/ErrorState'
import { FolderSummarySkeleton, ActivityRowsSkeleton } from '@/components/layout/PageSkeletons'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { useLastProjectView } from '@/features/projects/last-project-view'

export const Route = createFileRoute('/_app/f/$folderId')({
  component: FolderSummaryPage,
})

function FolderSummaryPage() {
  const { folderId } = Route.useParams()
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  // Reportado por el usuario: dentro de un espacio o carpeta, en mobile
  // solo se podía crear una LISTA (el CTA del estado vacío, que además
  // desaparece en cuanto hay algo adentro) — no había forma de crear una
  // subcarpeta. Mismas 2 opciones que ofrece el menú contextual de este
  // mismo nodo en el árbol de escritorio (NodeTreeItem.tsx): Carpeta y
  // Lista, nunca "Espacio" — eso solo tiene sentido en la raíz
  // (espacios.tsx).
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const { data: session } = useSession()
  const { workspaceId } = useCurrentWorkspace()
  const { data: treeRows } = useNodeTree(workspaceId ?? '')
  const { data: nodeDetail } = useNodeDetail(folderId)
  const { data: members } = useWorkspaceMembers(workspaceId ?? '')
  const updateDescriptionMutation = useUpdateNodeDescriptionMutation(folderId)

  const { byId } = useMemo(() => buildTree(treeRows ?? []), [treeRows])
  const node = byId.get(folderId)

  // Todo el árbol del workspace ya está cacheado (mismo dato que arma el
  // Sidebar) — el rollup recursivo del subárbol es un recorrido en
  // memoria, ver collectDescendantProjectIds (build-tree.ts).
  const projectIds = useMemo(() => (node ? collectDescendantProjectIds(node) : []), [node])
  const { data: statuses } = useQuery(workspaceStatusesQueryOptions(projectIds))
  const { data: tasks } = useSubtreeTasks(projectIds)
  // `activityPending` gatea el render (ver el mismo B-09 en summary.tsx):
  // sin esto, `activity` es `undefined` mientras carga y ActivityFeed
  // muestra su "todavía no hay actividad" un instante antes de saber si
  // en verdad hay actividad — este archivo nunca había tenido el guard.
  const { data: activity, isPending: activityPending } = useSubtreeActivity(projectIds)

  const statusesById = useMemo(() => new Map((statuses ?? []).map((s) => [s.id, s])), [statuses])
  const statusNamesById = useMemo(
    () => new Map([...statusesById].map(([id, s]) => [id, { name: s.name }])),
    [statusesById],
  )
  const membersById = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, { full_name: m.profile?.full_name ?? null }])),
    [members],
  )

  const stats = useMemo(() => {
    const list = tasks ?? []
    // Las descartadas no suman al progreso ni a la carga de trabajo
    // (decisión de producto: "Cerrar con subtareas abiertas") — total/
    // done/overdue/carga de trabajo se calculan sobre `activeList`, no
    // `list`.
    const activeList = list.filter((t) => statusesById.get(t.status_id ?? '')?.status_kind !== 'dropped')
    const total = activeList.length
    const isDone = (t: TaskSummary) => isDoneStatus(statusesById.get(t.status_id ?? '')?.status_kind)
    const done = activeList.filter(isDone).length
    // Mismo motivo que en summary.tsx: `formatDueDate` compara con
    // parseISO (zona local), no con `new Date(string)` (medianoche UTC) —
    // sin esto, una tarea que vence hoy cuenta como vencida durante gran
    // parte de la mañana en husos horarios negativos.
    const overdueTasks = activeList.filter((t) => !!t.due_date && !isDone(t) && formatDueDate(t.due_date).state === 'overdue')

    // "Carga de trabajo": mismo criterio que `topAssignees` en
    // p.$projectId/summary.tsx, pero sobre todo el subárbol en vez de un
    // solo proyecto.
    const assigneeCounts = new Map<string, { name: string; avatarUrl: string | null; count: number }>()
    for (const t of activeList) {
      if (!t.assignee) continue
      const existing = assigneeCounts.get(t.assignee.id)
      if (existing) existing.count += 1
      else assigneeCounts.set(t.assignee.id, { name: t.assignee.full_name ?? 'Sin nombre', avatarUrl: t.assignee.avatar_url, count: 1 })
    }
    const topAssignees = [...assigneeCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5)

    return { total, done, overdueCount: overdueTasks.length, overdueTasks, topAssignees }
  }, [tasks, statusesById])

  const progressPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  if (!node) {
    // El árbol todavía no cargó, o el id no corresponde a ningún nodo
    // accesible (folder/space borrado, o de otro workspace) — no hay
    // forma de distinguir "cargando" de "no existe" sin un fetch propio
    // (el árbol es la única fuente de este dato), así que se trata igual
    // que el resto de errores de nodo inaccesible en la app.
    return treeRows === undefined ? <FolderSummarySkeleton /> : <ErrorState error={new Error('Carpeta no encontrada')} />
  }

  const isSpace = node.type === 'space'
  const appearance = getNodeAppearance(node.custom_fields)
  return (
    <div className="p-4 pb-16 md:p-6">
      <div className="mb-2 hidden md:block">{workspaceId && <Breadcrumb workspaceId={workspaceId} nodeId={folderId} />}</div>
      {/* `hidden md:flex`: en mobile el nombre de la carpeta/espacio ya está
          en la cabecera contextual (Topbar.tsx + use-mobile-back.ts), fijo
          arriba en vez de irse con el scroll — repetirlo acá como <h1>
          gastaba una franja entera de la pantalla más chica diciendo lo
          mismo dos veces. Mismo criterio que el prototipo móvil, cuya
          pantalla de espacio arranca directo en "Listas". El "Volver" que
          vivía suelto acá arriba también se fue: lo da la misma cabecera,
          con el nombre del nivel anterior. */}
      <div className="mb-4 hidden items-center gap-2.5 md:flex">
        {isSpace ? (
          <NodeIconSwatch name={node.name} appearance={appearance} size="md" />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-alt">
            <HugeiconsIcon icon={Folder02Icon} className="size-5 text-text-muted" />
          </span>
        )}
        <h1 className="truncate text-xl font-semibold">{node.name}</h1>
      </div>

      <div className="mb-6 max-w-3xl">
        <TaskDescriptionEditor
          content={nodeDetail?.description ?? ''}
          onSave={(html) => updateDescriptionMutation.mutate(html)}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 @min-[720px]:grid-cols-4">
        <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
          <div className="font-mono text-[11px] tracking-wide text-text-muted uppercase">Elementos</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{node.children.length}</div>
          <div className="mt-2 text-xs text-text-muted">
            {node.children.filter((c) => c.type === 'project').length} listas ·{' '}
            {node.children.filter((c) => c.type === 'folder').length} subcarpetas
          </div>
        </div>
        <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
          <div className="font-mono text-[11px] tracking-wide text-text-muted uppercase">Tareas totales</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</div>
          <div className="mt-2 text-xs text-text-muted">en todo lo que contiene</div>
        </div>
        <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
          <div className="font-mono text-[11px] tracking-wide text-text-muted uppercase">Vencidas</div>
          <div className={cn('mt-1 text-2xl font-semibold tabular-nums', stats.overdueCount > 0 && 'text-danger-text')}>
            {stats.overdueCount}
          </div>
          <div className="mt-2 text-xs text-text-muted">a través de todos los hijos</div>
        </div>
        <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
          <div className="font-mono text-[11px] tracking-wide text-text-muted uppercase">Progreso</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{progressPct}%</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full rounded-full bg-success" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 @min-[720px]:grid-cols-2">
        <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
          <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">
            Archivos
          </h3>
          {/* `task_attachments.node_id` referencia cualquier nodo, no solo
              tareas (sin chequeo de type en la tabla ni en la RLS) — el
              mismo AttachmentList que ya usa el detalle de tarea funciona
              aquí tal cual, apuntado al nodo de la carpeta en vez de al de
              una tarea. Sin migración ni componente nuevo. */}
          {workspaceId && <AttachmentList nodeId={folderId} currentUserId={session?.user.id} />}
        </div>

        <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
          <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">
            Carga de trabajo
          </h3>
          {stats.topAssignees.length === 0 ? (
            <p className="text-xs text-text-muted">Sin tareas asignadas todavía.</p>
          ) : (
            <WorkloadList assignees={stats.topAssignees} />
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Contenido</h2>
          {/* `md:hidden`: en escritorio ya existe este mismo menú en la
              fila del árbol (NodeTreeItem.tsx, el "⋯" de cada nodo) — acá
              solo hacía falta el camino que faltaba en mobile. */}
          {workspaceId && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Crear carpeta o lista"
              onClick={() => setCreateMenuOpen(true)}
              className="md:hidden"
            >
              <HugeiconsIcon icon={PlusSignIcon} />
            </Button>
          )}
        </div>
        {node.children.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border p-10 text-center">
            <HugeiconsIcon icon={Folder02Icon} className="size-8 text-text-muted/50" />
            <div>
              <h4 className="text-sm font-medium">Todavía no hay nada aquí</h4>
              <p className="mt-1 max-w-sm text-xs text-text-muted">Crea una lista para empezar a agregar tareas.</p>
            </div>
            {workspaceId && (
              <div className="mt-1">
                <NewProjectDialog workspaceId={workspaceId} defaultParentId={folderId} />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Tabla de columnas alineadas: útil desde md: en adelante, donde
                hay ancho de sobra para comparar progreso/tareas/vencidas de
                un vistazo entre varios hijos. Por debajo de md:, la misma
                info como lista de filas tocables (ver ChildProjectRow/
                ChildFolderRow con variant="card") — la tabla forzaba scroll
                horizontal en ~375px y dejaba el nombre casi sin espacio. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-1.5 pr-3 text-[11px] font-medium tracking-wide text-text-muted uppercase">Nombre</th>
                    <th className="pb-1.5 pr-3 text-right text-[11px] font-medium tracking-wide text-text-muted uppercase">Progreso</th>
                    <th className="pb-1.5 pr-3 text-right text-[11px] font-medium tracking-wide text-text-muted uppercase">Tareas</th>
                    <th className="pb-1.5 text-right text-[11px] font-medium tracking-wide text-text-muted uppercase">Vencidas</th>
                  </tr>
                </thead>
                <tbody>
                  {node.children.map((child) =>
                    child.type === 'project' ? (
                      <ChildProjectRow key={child.id} projectId={child.id} name={child.name} tasks={tasks ?? []} statusesById={statusesById} variant="row" />
                    ) : (
                      <ChildFolderRow key={child.id} node={child} tasks={tasks ?? []} statusesById={statusesById} overdueTasks={stats.overdueTasks} variant="row" />
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-1 md:hidden">
              {node.children.map((child) =>
                child.type === 'project' ? (
                  <ChildProjectRow key={child.id} projectId={child.id} name={child.name} tasks={tasks ?? []} statusesById={statusesById} variant="card" />
                ) : (
                  <ChildFolderRow key={child.id} node={child} tasks={tasks ?? []} statusesById={statusesById} overdueTasks={stats.overdueTasks} variant="card" />
                ),
              )}
            </div>
          </>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-text">Actividad reciente en la carpeta</h2>
        {activityPending ? (
          <ActivityRowsSkeleton />
        ) : (
          <ActivityFeed
            entries={activity ?? []}
            context={{ statusesById: statusNamesById, membersById }}
            emptyLabel="Todavía no hay actividad aquí."
          />
        )}
      </div>

      {workspaceId && (
        <>
          <MobileCreateMenu
            open={createMenuOpen}
            onOpenChange={setCreateMenuOpen}
            title={`Crear en ${node.name}`}
            options={[
              {
                key: 'folder',
                icon: FolderAddIcon,
                label: 'Carpeta',
                description: 'Agrupa listas dentro de este nodo',
                onSelect: () => setNewFolderOpen(true),
              },
              {
                key: 'project',
                icon: CheckListIcon,
                label: 'Lista',
                description: 'Donde viven las tareas',
                onSelect: () => setNewProjectOpen(true),
              },
            ]}
          />
          <NewFolderDialog workspaceId={workspaceId} parentId={folderId} open={newFolderOpen} onOpenChange={setNewFolderOpen} />
          <NewProjectDialog
            workspaceId={workspaceId}
            defaultParentId={folderId}
            trigger="none"
            open={newProjectOpen}
            onOpenChange={setNewProjectOpen}
          />
        </>
      )}
    </div>
  )
}

function WorkloadList({ assignees }: { assignees: { name: string; avatarUrl: string | null; count: number }[] }) {
  const max = Math.max(...assignees.map((a) => a.count))
  return (
    <ul className="flex flex-col gap-2">
      {assignees.map((a) => (
        <li key={a.name} className="flex items-center gap-2">
          <span className="flex w-28 shrink-0 items-center gap-1.5 text-xs">
            <Avatar size="sm">
              {a.avatarUrl && <AvatarImage src={a.avatarUrl} alt="" />}
              <AvatarFallback>{initials(a.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate">{a.name}</span>
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(a.count / max) * 100}%` }} />
          </span>
          <span className="w-4 shrink-0 text-right font-mono text-xs text-text-muted">{a.count}</span>
        </li>
      ))}
    </ul>
  )
}

type ContentLinkTo =
  | '/p/$projectId/summary'
  | '/p/$projectId/board'
  | '/p/$projectId/list'
  | '/p/$projectId/calendar'
  | '/p/$projectId/gantt'
  | '/p/$projectId/table'
  | '/f/$folderId'

interface ContentEntryProps {
  to: ContentLinkTo
  params: { projectId: string } | { folderId: string }
  icon: Parameters<typeof HugeiconsIcon>[0]['icon']
  iconClassName: string
  name: string
  total: number
  pct: number
  overdueCount: number
}

function ContentRow({ to, params, icon, iconClassName, name, total, pct, overdueCount }: ContentEntryProps) {
  return (
    <tr className="border-b border-border/60 last:border-b-0 hover:bg-surface-alt">
      <td className="py-2 pr-3">
        <Link to={to} params={params} className="flex min-w-0 items-center gap-2 hover:underline">
          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', iconClassName)}>
            <HugeiconsIcon icon={icon} className="size-3.5" />
          </span>
          <span className="min-w-0 truncate font-medium">{name}</span>
        </Link>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-alt">
            <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-xs text-text-muted">{pct}%</span>
        </div>
      </td>
      <td className="py-2 pr-3 text-right text-xs text-text-muted">{total}</td>
      <td className={cn('py-2 text-right text-xs', overdueCount > 0 ? 'font-medium text-danger-text' : 'text-text-muted')}>
        {overdueCount}
      </td>
    </tr>
  )
}

// Fila tocable para debajo de md: (mismo lenguaje visual que las filas de
// espacio en espacios.tsx: ícono + nombre + línea secundaria + chevron) en
// vez de forzar la tabla de columnas alineadas a un scroll horizontal en
// ~375px, donde el nombre quedaba casi sin espacio.
function ContentCard({ to, params, icon, iconClassName, name, total, pct, overdueCount }: ContentEntryProps) {
  return (
    <Link
      to={to}
      params={params}
      className="flex min-h-13 items-center gap-3 rounded-md p-2 transition-colors active:bg-surface-alt hover:bg-surface-alt"
    >
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', iconClassName)}>
        <HugeiconsIcon icon={icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-text-muted">
          {pct}% · {total} tarea{total === 1 ? '' : 's'}
          {overdueCount > 0 && (
            <span className="font-medium text-danger-text">
              {' '}
              · {overdueCount} vencida{overdueCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
      </span>
      <HugeiconsIcon icon={ChevronRightIcon} className="size-4 shrink-0 text-text-muted" />
    </Link>
  )
}

function ChildProjectRow({
  projectId,
  name,
  tasks,
  statusesById,
  variant,
}: {
  projectId: string
  name: string
  tasks: TaskSummary[]
  statusesById: Map<string, StatusSummary>
  variant: 'row' | 'card'
}) {
  // Las descartadas no suman al progreso (decisión de producto: "Cerrar
  // con subtareas abiertas") — mismo criterio que el `stats` de arriba.
  const ownTasks = tasks
    .filter((t) => t.container_id === projectId)
    .filter((t) => statusesById.get(t.status_id ?? '')?.status_kind !== 'dropped')
  const total = ownTasks.length
  const done = ownTasks.filter((t) => isDoneStatus(statusesById.get(t.status_id ?? '')?.status_kind)).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const overdueCount = ownTasks.filter(
    (t) => !!t.due_date && !isDoneStatus(statusesById.get(t.status_id ?? '')?.status_kind) && formatDueDate(t.due_date).state === 'overdue',
  ).length

  // Antes iba siempre a /summary — mismo criterio que el árbol/favoritos
  // del sidebar (S-03/S-09): respeta la última vista visitada de esta
  // lista, o la vista por defecto de la cuenta si todavía no visitó
  // ninguna.
  const { data: session } = useSession()
  const { data: profile } = useProfile(session?.user.id ?? '')
  const lastView = useLastProjectView(projectId, defaultViewToRoute(profile?.default_view))

  const Entry = variant === 'card' ? ContentCard : ContentRow
  return (
    <Entry
      to={lastView}
      params={{ projectId }}
      icon={CheckListIcon}
      iconClassName="bg-accent-soft text-accent"
      name={name}
      total={total}
      pct={pct}
      overdueCount={overdueCount}
    />
  )
}

function ChildFolderRow({
  node,
  tasks,
  statusesById,
  overdueTasks,
  variant,
}: {
  node: TreeNode
  tasks: TaskSummary[]
  statusesById: Map<string, StatusSummary>
  overdueTasks: TaskSummary[]
  variant: 'row' | 'card'
}) {
  const descendantProjectIds = useMemo(() => new Set(collectDescendantProjectIds(node)), [node])
  // Las descartadas no suman al progreso — mismo criterio que el resto de
  // esta pantalla (decisión de producto: "Cerrar con subtareas abiertas").
  const ownTasks = tasks
    .filter((t) => descendantProjectIds.has(t.container_id))
    .filter((t) => statusesById.get(t.status_id ?? '')?.status_kind !== 'dropped')
  const total = ownTasks.length
  const done = ownTasks.filter((t) => isDoneStatus(statusesById.get(t.status_id ?? '')?.status_kind)).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const overdueCount = overdueTasks.filter((t) => descendantProjectIds.has(t.container_id)).length

  const Entry = variant === 'card' ? ContentCard : ContentRow
  return (
    <Entry
      to="/f/$folderId"
      params={{ folderId: node.id }}
      icon={Folder02Icon}
      iconClassName="bg-surface-alt text-text-muted"
      name={node.name}
      total={total}
      pct={pct}
      overdueCount={overdueCount}
    />
  )
}
