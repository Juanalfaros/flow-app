import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  MailAtSign01Icon,
  Clock01Icon,
  UserGroupIcon,
  Briefcase01Icon,
  Edit02Icon,
  Delete02Icon,
  CheckListIcon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { usePeople, usePerson, formatLocalTime } from '@/features/people/queries'
import { useTeamsByUser } from '@/features/teams/queries'
import { ROLE_LABEL } from '@/features/workspace/roles'
import { EditMemberDialog } from '@/features/people/components/EditMemberDialog'
import { useRemoveMemberMutation } from '@/features/people/mutations'
import { PersonSummaryTab } from '@/features/people/components/PersonSummaryTab'
import { PersonActivityTab } from '@/features/people/components/PersonActivityTab'
import { PersonTasksTab } from '@/features/people/components/PersonTasksTab'
import { PersonCommentsTab } from '@/features/people/components/PersonCommentsTab'
import { PersonCalendarTab } from '@/features/people/components/PersonCalendarTab'
import { useOnlineUserIds, describeLastSeen } from '@/features/people/use-workspace-presence'
import { usePersonTimeOff, isAwayOn, TIME_OFF_KIND_LABEL } from '@/features/people/time-off'
import { initials } from '@/lib/initials'

type PersonTab = 'resumen' | 'actividad' | 'tareas' | 'comentarios' | 'calendario'

export function PersonPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data: session } = useSession()
  const { workspaceId, role: viewerRole } = useCurrentWorkspace()
  const { data: person, isPending } = usePerson(workspaceId, userId)
  const { data: people } = usePeople(workspaceId)
  const { data: teamsByUser } = useTeamsByUser(workspaceId)
  const onlineIds = useOnlineUserIds()
  const { data: timeOff } = usePersonTimeOff(workspaceId, userId)
  // Las pestañas montan su contenido solo cuando están activas: son cinco
  // queries distintas y traerlas todas al abrir la ficha gastaría cinco
  // round-trips para mostrar una. `resumen` primero (rediseño de Equipo,
  // 2026-09-24): es la que contesta "¿debería mirar esto ahora?" sin
  // tener que elegir una pestaña.
  const [tab, setTab] = useState<PersonTab>('resumen')
  const [editOpen, setEditOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const removeMutation = useRemoveMemberMutation()
  const isAdmin = viewerRole === 'owner' || viewerRole === 'admin'
  const isSelf = userId === session?.user.id

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="mt-4 h-32" />
      </div>
    )
  }

  if (!person) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-text-secondary">Esta persona ya no está en el workspace.</p>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    )
  }

  const localTime = formatLocalTime(person.timezone)
  const teams = teamsByUser?.get(person.id) ?? []
  const isOnline = onlineIds.has(person.id)
  // Misma jerarquía de 3 niveles que valida remove_member (0075) — este
  // chequeo solo evita ofrecer un botón que el servidor va a rechazar
  // igual, la validación real vive en la RPC (y en la policy de RLS como
  // segunda capa).
  const canRemove =
    isAdmin && !isSelf && person.role !== 'owner' && !(viewerRole === 'admin' && person.role === 'admin')
  // "Visto hace X" solo cuando NO está conectado: decir ambas cosas a la vez
  // sería redundante y confuso.
  const lastSeen = isOnline ? null : describeLastSeen(person.last_seen_at)
  const away = isAwayOn(timeOff ?? [])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-start gap-3 p-5 pb-4">
        <Avatar size="lg" className="size-14">
          {person.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
          <AvatarFallback className="text-base">{initials(person.full_name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">{person.full_name ?? 'Sin nombre todavía'}</h2>
          <p className="truncate text-sm text-text-secondary">
            {person.job_title ?? <span className="text-text-muted italic">Sin cargo</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              {ROLE_LABEL[person.role] ?? person.role}
            </span>
            {isOnline ? (
              <span className="flex items-center gap-1 text-[10px] font-medium text-success-text">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                Conectado
              </span>
            ) : (
              lastSeen && <span className="text-[10px] text-text-muted">{lastSeen}</span>
            )}
            {away && (
              <span className="rounded-full bg-accent-2-bg px-1.5 py-0.5 text-[10px] font-medium text-accent-2-text-on-bg">
                {TIME_OFF_KIND_LABEL[away.kind] ?? away.kind}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {isAdmin && (
            <Button variant="ghost" size="icon-sm" aria-label="Editar persona" onClick={() => setEditOpen(true)}>
              <HugeiconsIcon icon={Edit02Icon} />
            </Button>
          )}
          {canRemove && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Eliminar del workspace"
              onClick={() => setRemoveOpen(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Cerrar ficha" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>
      </div>

      {/* "Ver sus tareas" cambia de pestaña en vez de navegar — la ficha ya
          está abierta, salir a /mis-tareas perdería el contexto de quién
          se estaba mirando. Rediseño de Equipo, 2026-09-24; no se agregó
          un botón "Asignar tarea" (sí lo pide la maqueta): crear una tarea
          necesita elegir antes una lista, y ese flujo no existe hoy fuera
          del toolbar de cada proyecto — construirlo de cero es más que
          esta ficha, queda pendiente aparte. */}
      <div className="px-5 pb-4">
        <Button variant="outline" size="sm" onClick={() => setTab('tareas')}>
          <HugeiconsIcon icon={CheckListIcon} />
          Ver sus tareas
        </Button>
      </div>

      {isAdmin && editOpen && (
        // Montado solo cuando está abierto — mismo criterio que
        // AutomationRulesDialog/NodeAccessDialog en otras fichas.
        <EditMemberDialog
          person={person}
          workspaceId={workspaceId}
          // Mismo hueco que canRemove tenía tapado y este control no: un
          // administrador (no dueño) lograba degradar a OTRO administrador
          // vía este mismo diálogo — mismo resultado práctico que
          // remove_member bloquea a propósito, por la puerta de al lado.
          // Confirmado a mano contra producción y corregido también en la
          // RPC (0086_admin_role_hierarchy.sql); esto solo evita ofrecer
          // un control que el servidor ya rechaza.
          canChangeRole={person.role !== 'owner' && !isSelf && !(viewerRole === 'admin' && person.role === 'admin')}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {canRemove && (
        <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar a {person.full_name ?? 'esta persona'} del workspace?</AlertDialogTitle>
              <AlertDialogDescription>
                Pierde acceso de inmediato. Sus tareas y comentarios existentes no se borran, solo deja de ser
                miembro. Esta acción no se puede deshacer desde acá.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={removeMutation.isPending}
                onClick={() =>
                  removeMutation.mutate(person.id, {
                    onSuccess: () => {
                      toast.success(`${person.full_name ?? 'La persona'} ya no es parte del workspace.`)
                      setRemoveOpen(false)
                      onClose()
                    },
                  })
                }
              >
                {removeMutation.isPending ? 'Eliminando…' : 'Eliminar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <dl className="flex flex-col gap-2 px-5 pb-4 text-sm">
        <PanelRow icon={MailAtSign01Icon} label="Correo">
          <a href={`mailto:${person.email}`} className="truncate hover:underline">
            {person.email}
          </a>
        </PanelRow>
        {localTime && (
          <PanelRow icon={Clock01Icon} label="Hora local">
            {localTime} hora local
          </PanelRow>
        )}
        {teams.length > 0 && (
          <PanelRow icon={UserGroupIcon} label="Equipos">
            {teams.map((t) => t.name).join(', ')}
          </PanelRow>
        )}
        {!person.job_title && !person.timezone && teams.length === 0 && (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <HugeiconsIcon icon={Briefcase01Icon} className="size-4 shrink-0" />
            Sin cargo, zona horaria ni equipos asignados todavía.
          </p>
        )}
      </dl>

      <Tabs value={tab} onValueChange={(v) => setTab(v as PersonTab)} className="min-h-0 flex-1">
        <TabsList className="mx-5 w-[calc(100%-2.5rem)]">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="actividad">Actividad</TabsTrigger>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="comentarios">Comentarios</TabsTrigger>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
        </TabsList>
        <div className="p-5 pt-3">
          <TabsContent value="resumen">
            {tab === 'resumen' && (
              <PersonSummaryTab workspaceId={workspaceId} person={person} people={people ?? []} onOpenTasks={() => setTab('tareas')} />
            )}
          </TabsContent>
          <TabsContent value="actividad">
            {tab === 'actividad' && <PersonActivityTab workspaceId={workspaceId} userId={person.id} />}
          </TabsContent>
          <TabsContent value="tareas">
            {tab === 'tareas' && <PersonTasksTab workspaceId={workspaceId} userId={person.id} />}
          </TabsContent>
          <TabsContent value="comentarios">
            {tab === 'comentarios' && <PersonCommentsTab userId={person.id} />}
          </TabsContent>
          <TabsContent value="calendario">
            {tab === 'calendario' && <PersonCalendarTab workspaceId={workspaceId} userId={person.id} />}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

function PanelRow({
  icon,
  label,
  children,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]['icon']
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <HugeiconsIcon icon={icon} className="size-4 shrink-0 text-text-muted" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 truncate text-text-secondary">{children}</dd>
    </div>
  )
}
