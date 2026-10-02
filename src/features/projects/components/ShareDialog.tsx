import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Share08Icon,
  Copy01Icon,
  LockIcon,
  InformationCircleIcon,
  UserAdd01Icon,
  Globe02Icon,
  RefreshIcon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useInviteMemberMutation } from '@/features/workspace/mutations'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { INVITABLE_ROLES, ROLE_LABEL } from '@/features/workspace/roles'
import { useNodeTree } from '@/features/nodes/queries'
import { NodeAccessDialog } from '@/features/sharing/components/NodeAccessDialog'
import {
  usePublicLink,
  useCreatePublicLinkMutation,
  useRegeneratePublicLinkMutation,
  useRevokePublicLinkMutation,
  publicLinkUrl,
} from '@/features/sharing/public-link'
import { initials } from '@/lib/initials'

interface ShareDialogProps {
  workspaceId: string
  projectId: string
  projectName: string
}

// Query params que Lista/Board/Calendario/Gantt/Tabla ya sincronizan con
// la URL (ver useProjectViewSearch.ts) — filtro por etiqueta/asignado/
// prioridad, orden y búsqueda. "Compartir esta vista" no necesita guardar
// nada nuevo: la URL actual YA es la vista completa, solo hace falta
// copiarla con su query string intacto.
const VIEW_FILTER_PARAM_KEYS = ['labelId', 'assigneeIds', 'priority', 'sort', 'q'] as const

// Modal "Compartir esta lista" estilo ClickUp. Todo lo que se ofrece acá
// tiene backend real (invitar por correo, lista de miembros, copiar
// enlace, "Hacer privado", link público — ver 0034_project_acl_data.sql
// / 0085_public_links.sql). Los 4 niveles de permiso por rol
// (full_edit/edit/comment/view, alguna vez en src/features/sharing/types.ts)
// se evaluaron y el usuario decidió no construirlos — hoy todo el que
// tiene acceso a la lista edita igual. Se sacó el <Select> deshabilitado
// que los insinuaba (confuso: parecía un control activo) a favor de una
// nota de texto plano.
export function ShareDialog({ workspaceId, projectId, projectName }: ShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('member')
  const inviteMutation = useInviteMemberMutation(workspaceId)
  const { data: members } = useWorkspaceMembers(workspaceId)
  const { data: publicLink } = usePublicLink(projectId)
  const createPublicLink = useCreatePublicLinkMutation(projectId)
  const regeneratePublicLink = useRegeneratePublicLinkMutation(projectId)
  const revokePublicLink = useRevokePublicLinkMutation(projectId)
  // Ya en cache: el sidebar mantiene esta misma query montada todo el rato
  // que hay un workspace abierto — no dispara un round-trip nuevo.
  const { data: treeRows } = useNodeTree(workspaceId)
  const isPrivate = treeRows?.find((n) => n.id === projectId)?.is_private ?? false

  // Se lee directo de `window.location` en cada render, sin guardarlo en
  // estado: abrir el modal (`setOpen(true)`) ya es un render nuevo, así
  // que alcanza para reflejar los filtros que estaban activos al abrirlo.
  const activeViewFilterCount = VIEW_FILTER_PARAM_KEYS.filter((key) =>
    new URLSearchParams(window.location.search).has(key),
  ).length

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Compartir" className="ml-auto">
                <HugeiconsIcon icon={Share08Icon} />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Compartir</TooltipContent>
        </Tooltip>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Compartir esta lista</DialogTitle>
            <p className="text-xs text-text-muted">{projectName}</p>
          </DialogHeader>

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              inviteMutation.mutate(
                { email, role: inviteRole },
                {
                  onSuccess: () => {
                    toast.success(`Invitación enviada a ${email}`)
                    setEmail('')
                  },
                  onError: (err: Error) => toast.error(err.message),
                },
              )
            }}
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="share-invite-email">Invitar por correo</Label>
              <Input
                id="share-invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="compañero@empresa.com"
              />
            </div>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              className="bg-accent-solid text-accent-foreground hover:bg-accent-solid/90"
            >
              <HugeiconsIcon icon={UserAdd01Icon} />
              {inviteMutation.isPending ? 'Invitando…' : 'Invitar'}
            </Button>
          </form>
          <p className="-mt-2 text-xs text-text-muted">
            Se invita a todo el workspace — todavía no existe una invitación acotada a una sola lista.
          </p>

          <Separator />

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-sm">
              <HugeiconsIcon icon={LockIcon} className="size-4 text-text-muted" />
              Enlace privado
              <Tooltip>
                <TooltipTrigger asChild>
                  <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 shrink-0 text-text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-56">
                  Quien reciba este enlace igual necesita ser miembro del workspace para poder verlo.
                </TooltipContent>
              </Tooltip>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(window.location.origin + window.location.pathname)
                toast.success('Enlace copiado')
              }}
            >
              <HugeiconsIcon icon={Copy01Icon} />
              Copiar enlace
            </Button>
          </div>

          {/* Link público (0085_public_links.sql): a diferencia de "Enlace
              privado" de arriba, quien lo abre NO necesita cuenta ni ser
              miembro del workspace — para compartir una lista con un
              cliente externo sin darle acceso a la app. Solo lectura: sin
              editar/comentar/asignar del otro lado. */}
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-sm">
              <HugeiconsIcon icon={Globe02Icon} className="size-4 text-text-muted" />
              Link público
              <Tooltip>
                <TooltipTrigger asChild>
                  <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 shrink-0 text-text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-56">
                  Quien reciba este enlace lo ve sin necesidad de una cuenta — solo puede mirar, no editar.
                </TooltipContent>
              </Tooltip>
            </span>
            {publicLink ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(publicLinkUrl(publicLink.token))
                    toast.success('Link público copiado')
                  }}
                >
                  <HugeiconsIcon icon={Copy01Icon} />
                  Copiar
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Regenerar link público"
                      disabled={regeneratePublicLink.isPending}
                      onClick={() =>
                        regeneratePublicLink.mutate(undefined, {
                          onSuccess: () => toast.success('Se generó un link nuevo — el anterior dejó de funcionar.'),
                        })
                      }
                    >
                      <HugeiconsIcon icon={RefreshIcon} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Regenerar (invalida el actual)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Desactivar link público"
                      disabled={revokePublicLink.isPending}
                      onClick={() => revokePublicLink.mutate()}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Desactivar</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={createPublicLink.isPending}
                onClick={() =>
                  createPublicLink.mutate(undefined, {
                    onSuccess: (token) => {
                      navigator.clipboard.writeText(publicLinkUrl(token))
                      toast.success('Link público creado y copiado')
                    },
                  })
                }
              >
                <HugeiconsIcon icon={Globe02Icon} />
                Generar
              </Button>
            )}
          </div>

          {/* Antes había acá un <Select> deshabilitado con 4 niveles de
              permiso ("Edición total"/"Edición"/"Comentario"/"Solo
              lectura") y un badge "Pronto" — se veía y se comportaba como
              un control activo (mismo tamaño/forma que el resto de los
              <Select> del diálogo, con su propia flecha) pero no hacía
              nada: reportado por el usuario como confuso ("no sé si está
              activo"). El "Pronto" además prometía algo que no va a
              construirse — la decisión de dejar un solo nivel de permiso
              para todos ya se tomó y se reconfirmó explícitamente. Una
              nota de texto plano, sin nada con forma de control, dice lo
              mismo sin la ambigüedad. */}
          <p className="text-xs text-text-muted">
            Todos los miembros con acceso a esta lista tienen el mismo permiso de edición — "Hacer privado" abajo
            controla QUIÉN entra, no qué puede hacer cada quien una vez adentro.
          </p>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted uppercase">Compartir con</span>
            {members?.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2 text-sm">
                <Avatar size="sm">
                  {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} alt="" />}
                  <AvatarFallback>{initials(m.profile?.full_name ?? null)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">{m.profile?.full_name ?? m.user_id}</span>
              </div>
            ))}
            <p className="text-xs text-text-muted">Todos los miembros del workspace ya tienen acceso a esta lista.</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setAccessDialogOpen(true)
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-surface-alt"
          >
            <HugeiconsIcon icon={LockIcon} className="size-4" />
            {isPrivate ? 'Gestionar acceso' : 'Hacer privado'}
          </button>

          {/* "Compartir esta vista" (el filtro/orden/búsqueda puntual que
              se está mirando ahora mismo, no la lista entera): Lista/
              Board/Calendario/Gantt/Tabla ya sincronizan sus filtros con
              la URL (useProjectViewSearch.ts), así que la vista actual YA
              está completa en `window.location.href` — no hace falta
              guardar nada nuevo, solo copiarla con su query string
              intacto. Distinto de "Copiar enlace" de arriba, que a
              propósito apunta a la lista pelada (sin filtros). */}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href)
              toast.success(
                activeViewFilterCount > 0 ? 'Enlace de esta vista copiado, con sus filtros' : 'Enlace copiado',
              )
            }}
            className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-alt"
          >
            <span>Compartir esta vista</span>
            {activeViewFilterCount > 0 ? (
              <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                {activeViewFilterCount} {activeViewFilterCount === 1 ? 'filtro activo' : 'filtros activos'}
              </span>
            ) : (
              <span className="text-xs text-text-muted">Sin filtros</span>
            )}
          </button>
        </DialogContent>
      </Dialog>

      {accessDialogOpen && (
        <NodeAccessDialog
          nodeId={projectId}
          nodeName={projectName}
          kind="project"
          isPrivate={isPrivate}
          open={accessDialogOpen}
          onOpenChange={setAccessDialogOpen}
        />
      )}
    </>
  )
}
