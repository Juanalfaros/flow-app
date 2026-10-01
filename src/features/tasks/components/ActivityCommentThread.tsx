import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChevronDownIcon, ChevronRightIcon, Delete02Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActivity } from '@/features/activity/queries'
import { describeActivity } from '@/features/activity/describe'
import { useComments, type CommentSummary } from '@/features/comments/queries'
import { useDeleteCommentMutation } from '@/features/comments/mutations'
import { CommentForm } from '@/features/comments/components/CommentForm'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { buildHierarchy, type TreeOf } from '@/lib/hierarchy'
import type { StatusSummary } from '@/features/projects/queries'
import { formatRelativeTime } from '@/lib/format-date'
import { initials } from '@/lib/initials'

interface Member {
  user_id: string
  profile: { full_name: string | null } | null
}

interface ActivityCommentThreadProps {
  taskId: string
  workspaceId: string
  statuses: StatusSummary[]
  members: Member[]
}

type CommentNode = TreeOf<CommentSummary>

// Reemplaza a ActivityFeed + CommentList como dos tarjetas separadas: los
// cambios de campo (mucho más frecuentes, poco interesantes uno por uno)
// quedan como líneas finas de contexto, los comentarios (lo que más se
// usa) como el elemento con más peso visual — un solo hilo cronológico en
// vez de dos listas con orden invertido entre sí (activity desc, comments
// asc) en tarjetas separadas.
//
// F5 #5 (threading, anidamiento libre): `activity_log` sigue intercalado
// cronológicamente — ningún ítem de actividad tiene hijos. Los
// comentarios RAÍZ ocupan su posición cronológica de siempre entre la
// actividad; las RESPUESTAS se renderizan anidadas bajo su comentario
// raíz (recursivo, vía `buildHierarchy` — el mismo helper que arma el
// árbol de espacios/carpetas del sidebar), no intercaladas por fecha
// entre medio de otra actividad — mismo criterio que Linear/GitHub: el
// hilo completo de un comentario vive junto, aunque una respuesta llegue
// días después.
export function ActivityCommentThread({ taskId, workspaceId, statuses, members }: ActivityCommentThreadProps) {
  const { data: activity } = useActivity(taskId)
  const { data: comments } = useComments(taskId)
  const { data: session } = useSession()
  const { role } = useCurrentWorkspace()
  // Colapsada por defecto — los comentarios (lo que importa leer) nunca
  // se ocultan, solo las líneas finas de "cambió tal campo". Sin esto,
  // una tarea con edición frecuente (varios campos tocados varias veces)
  // termina con una pantalla entera de líneas grises antes de llegar al
  // primer comentario real. Reportado por el usuario, que además pidió
  // el chevron en vez del link de texto que tenía esta sección antes.
  const [activityExpanded, setActivityExpanded] = useState(false)

  const userId = session?.user.id
  // Espeja `comments_delete_own_or_admin` (0008_nodes_engine.sql §13) — ver
  // mismo comentario en el CommentList original.
  const isAdmin = role === 'owner' || role === 'admin'

  const statusesById = useMemo(() => new Map(statuses.map((s) => [s.id, { name: s.name }])), [statuses])
  const membersById = useMemo(
    () => new Map(members.map((m) => [m.user_id, { full_name: m.profile?.full_name ?? null }])),
    [members],
  )

  const commentRoots = useMemo(() => buildHierarchy(comments ?? []).roots, [comments])

  type ThreadItem =
    | { kind: 'activity'; id: string; created_at: string; text: string }
    | { kind: 'comment'; id: string; created_at: string; node: CommentNode }

  // Todo o nada: colapsada, ninguna línea de actividad entra al hilo
  // (los comentarios siguen intactos); expandida, entran todas — ver el
  // toggle de más abajo.
  const visibleActivity = activityExpanded ? activity : undefined
  const activityCount = activity?.length ?? 0

  const items = useMemo<ThreadItem[]>(() => {
    const activityItems: ThreadItem[] = (visibleActivity ?? []).map((entry) => ({
      kind: 'activity',
      id: entry.id,
      created_at: entry.created_at,
      text: describeActivity(entry, { statusesById, membersById }),
    }))
    const commentItems: ThreadItem[] = commentRoots.map((node) => ({
      kind: 'comment',
      id: node.id,
      created_at: node.created_at,
      node,
    }))
    // `comments` llega asc (ver su queryOptions) — se reordena acá una
    // sola vez, en el punto donde ambas fuentes se mezclan. Las
    // respuestas NO participan de este sort: viajan dentro de
    // `node.children` y las renderiza CommentThreadItem de forma
    // recursiva, siempre pegadas a su padre.
    return [...activityItems, ...commentItems].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [visibleActivity, statusesById, membersById, commentRoots])

  if (activity === undefined || comments === undefined) return null
  // El vacío real es "nada de nada" — con actividad colapsada pero
  // existente, `items` puede estar vacío (0 comentarios) sin que la
  // sección esté realmente vacía, por eso se chequea contra los totales
  // y no contra `items.length`.
  const isEmpty = activityCount === 0 && commentRoots.length === 0

  return (
    <div className="flex flex-col gap-1.5">
      {isEmpty && <p className="text-sm text-text-secondary">Sin actividad todavía.</p>}
      {activityCount > 0 && (
        <button
          type="button"
          onClick={() => setActivityExpanded((v) => !v)}
          className="flex items-center gap-1 self-start pl-8 text-xs text-text-muted hover:text-text-secondary hover:underline"
        >
          <HugeiconsIcon icon={activityExpanded ? ChevronDownIcon : ChevronRightIcon} className="size-3" />
          {activityExpanded
            ? 'Ocultar actividad'
            : `Mostrar actividad (${activityCount})`}
        </button>
      )}
      {items.map((item) =>
        item.kind === 'activity' ? (
          <p key={item.id} className="pl-8 text-xs text-text-muted">
            {item.text} · {formatRelativeTime(item.created_at)}
          </p>
        ) : (
          <CommentThreadItem
            key={item.id}
            node={item.node}
            depth={0}
            taskId={taskId}
            workspaceId={workspaceId}
            userId={userId}
            // El email era lo único a mano sin otra query — no es el
            // nombre real, así que la fila optimista de una respuesta
            // mostraba el email hasta que llegaba la respuesta del
            // servidor y la reemplazaba. `membersById` ya trae el
            // full_name real de cada miembro (viene por prop, `members`),
            // incluido el propio usuario logueado.
            userLabel={(userId ? membersById.get(userId)?.full_name : null) ?? session?.user.email ?? 'Tú'}
            isAdmin={isAdmin}
          />
        ),
      )}
    </div>
  )
}

// Tope de indentación visual en depth=6 (aunque el dato siga anidando más
// hondo): patrón estándar de Reddit/GitHub — sin esto, un hilo de 15
// respuestas seguidas empuja el texto fuera de una pantalla angosta.
const MAX_INDENT_DEPTH = 6
const INDENT_PX = 16

function CommentThreadItem({
  node,
  depth,
  taskId,
  workspaceId,
  userId,
  userLabel,
  isAdmin,
}: {
  node: CommentNode
  depth: number
  taskId: string
  workspaceId: string
  userId: string | undefined
  userLabel: string
  isAdmin: boolean
}) {
  const [replying, setReplying] = useState(false)
  const deleteMutation = useDeleteCommentMutation(taskId)
  const canDelete = node.author_id === userId || isAdmin

  return (
    <div style={{ marginLeft: Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX }}>
      <div className="group/comment flex gap-2 py-0.5">
        <Avatar size="sm">
          {node.author?.avatar_url && <AvatarImage src={node.author.avatar_url} alt="" />}
          <AvatarFallback>{initials(node.author?.full_name ?? null)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1.5 text-xs text-text-secondary">
            <span className="font-medium">{node.author?.full_name}</span>
            <span className="font-mono text-[10px] text-text-muted">{formatRelativeTime(node.created_at)}</span>
          </p>
          <p className="text-sm break-words">{node.body}</p>
          {userId && (
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              className="mt-0.5 text-xs text-text-muted hover:text-text-secondary hover:underline"
            >
              Responder
            </button>
          )}
        </div>
        {canDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Eliminar comentario"
                className="shrink-0 opacity-0 transition-opacity group-hover/comment:opacity-100 focus-visible:opacity-100"
                onClick={() => deleteMutation.mutate(node.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Eliminar comentario</TooltipContent>
          </Tooltip>
        )}
      </div>

      {replying && userId && (
        <div className="mt-1.5 mb-2 ml-8">
          <CommentForm
            taskId={taskId}
            authorId={userId}
            authorLabel={userLabel}
            workspaceId={workspaceId}
            parentId={node.id}
            autoFocus
            onCancel={() => setReplying(false)}
          />
        </div>
      )}

      {node.children.map((child) => (
        <CommentThreadItem
          key={child.id}
          node={child}
          depth={depth + 1}
          taskId={taskId}
          workspaceId={workspaceId}
          userId={userId}
          userLabel={userLabel}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  )
}
