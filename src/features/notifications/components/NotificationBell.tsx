import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { BellIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useProjects, workspaceStatusesQueryOptions } from '@/features/projects/queries'
import { useNotifications } from '@/features/notifications/queries'
import { useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } from '@/features/notifications/mutations'
import { useNotificationsRealtimeChannel } from '@/features/notifications/realtime'
import { useMyTasksRealtimeChannel } from '@/features/my-tasks/realtime'
import { describeNotification } from '@/features/notifications/describe'

export function NotificationBell() {
  const { data: session } = useSession()
  const userId = session?.user.id
  const { workspaceId } = useCurrentWorkspace()
  const { data: projects } = useProjects(workspaceId)
  const projectIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])
  const { data: statuses } = useQuery(workspaceStatusesQueryOptions(projectIds))
  const statusesById = useMemo(() => new Map((statuses ?? []).map((s) => [s.id, { name: s.name }])), [statuses])

  const { data: notifications } = useNotifications(userId, { unreadOnly: true })
  const markReadMutation = useMarkNotificationReadMutation(userId)
  const markAllReadMutation = useMarkAllNotificationsReadMutation(userId)
  const navigate = useNavigate()

  useNotificationsRealtimeChannel(userId)
  // Mismo mount global que el canal de notificaciones de arriba —
  // NotificationBell ya vive en Topbar (presente en toda ruta
  // autenticada), así que es el punto natural para un segundo canal que
  // también necesita workspaceId/userId sin agregar otro componente
  // invisible más al árbol solo para esto.
  useMyTasksRealtimeChannel(workspaceId, userId)

  const count = notifications?.length ?? 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* size-10 (40px) pisa el size-7 (28px) de "icon-sm" — área de toque
            táctil del Topbar; el ícono de la campana no cambia de tamaño. */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative size-10"
          aria-label={`Notificaciones (${count} sin leer)`}
        >
          <HugeiconsIcon icon={BellIcon} />
          {count > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1">
              {count}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-medium">Notificaciones</span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              className="text-xs text-accent hover:underline"
            >
              Marcar todas como leídas
            </button>
          )}
        </div>
        {count === 0 && <p className="px-2 py-1.5 text-sm text-text-muted">Sin notificaciones nuevas.</p>}
        {notifications?.map((n) => {
          const projectId = n.node?.memberships[0]?.container_id
          return (
            <DropdownMenuItem
              key={n.id}
              onSelect={() => {
                markReadMutation.mutate(n.id)
                if (projectId && n.node) {
                  navigate({ to: '/p/$projectId/t/$taskId', params: { projectId, taskId: n.node.id } })
                } else {
                  navigate({ to: '/bandeja' })
                }
              }}
            >
              <div className="flex flex-col">
                {/* Los 3 tipos sin tarea (0076: removed_from_workspace,
                    role_changed, welcome) no tienen `n.node` — "una tarea"
                    quedaría mal puesto arriba de un aviso sobre el
                    workspace, no sobre una tarea. */}
                <span className="truncate text-sm">{n.node?.title ?? 'Flow'}</span>
                <span className="text-xs text-text-muted">{describeNotification(n, { statusesById })}</span>
              </div>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuItem onSelect={() => navigate({ to: '/bandeja' })} className="justify-center text-accent">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
          Ver todas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
