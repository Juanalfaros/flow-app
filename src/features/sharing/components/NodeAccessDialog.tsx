import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  LockIcon,
  Globe02Icon,
  UserGroupIcon,
  Delete02Icon,
  PlusSignIcon,
  Copy01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { usePeople } from '@/features/people/queries'
import { useTeams } from '@/features/teams/queries'
import {
  useGrantNodeAccessMutation,
  useRevokeNodeAccessMutation,
  useSetNodePrivacyMutation,
  useNodeAccess,
} from '@/features/sharing/node-access'
import {
  usePublicLink,
  useCreatePublicLinkMutation,
  useRegeneratePublicLinkMutation,
  useRevokePublicLinkMutation,
  publicLinkUrl,
} from '@/features/sharing/public-link'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

// Metadata de texto por tipo de nodo — la lógica de acceso (is_private +
// node_access) es idéntica para los 4 (ver 0034_project_acl_data.sql: el
// modelo nunca se restringió a nivel de columna, solo faltaba conectar
// el diálogo). `kind` sigue llamándose 'project' para listas (F-08: solo
// cambió la copy visible, no los identificadores).
const KIND_META: Record<
  NodeAccessDialogProps['kind'],
  { label: string; article: string; adjSuffix: string; contents: string }
> = {
  // 'espacio' es masculino ("este espacio", "privado").
  space: { label: 'espacio', article: 'este', adjSuffix: 'o', contents: 'carpetas, listas y tareas' },
  // 'lista'/'carpeta'/'tarea' son femeninos ("esta lista", "privada").
  project: { label: 'lista', article: 'esta', adjSuffix: 'a', contents: 'sus tareas' },
  folder: { label: 'carpeta', article: 'esta', adjSuffix: 'a', contents: 'carpetas, listas y tareas' },
  task: { label: 'tarea', article: 'esta', adjSuffix: 'a', contents: 'sus subtareas' },
}

interface NodeAccessDialogProps {
  nodeId: string
  nodeName: string
  kind: 'space' | 'project' | 'folder' | 'task'
  isPrivate: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NodeAccessDialog({ nodeId, nodeName, kind, isPrivate, open, onOpenChange }: NodeAccessDialogProps) {
  const { workspaceId } = useCurrentWorkspace()
  const { data: access, isPending } = useNodeAccess(nodeId)
  const { data: people } = usePeople(workspaceId)
  const { data: teams } = useTeams(workspaceId)
  const setPrivacy = useSetNodePrivacyMutation(workspaceId)
  const grant = useGrantNodeAccessMutation(nodeId)
  const revoke = useRevokeNodeAccessMutation(nodeId)
  const [toAdd, setToAdd] = useState('')
  // Link público (0085_public_links.sql): solo para tareas acá — las
  // listas ya lo ofrecen desde ShareDialog.tsx (su propio punto de
  // entrada de "compartir"), y espacios/carpetas quedaron fuera de
  // alcance a propósito (decisión de producto: el link sin cuenta es
  // por lista o por tarea individual, no por contenedor más grande).
  const { data: publicLink } = usePublicLink(nodeId)
  const createPublicLink = useCreatePublicLinkMutation(nodeId)
  const regeneratePublicLink = useRegeneratePublicLinkMutation(nodeId)
  const revokePublicLink = useRevokePublicLinkMutation(nodeId)

  const { label: kindLabel, article: kindArticle, adjSuffix: kindAdjSuffix, contents: contentsLabel } = KIND_META[kind]

  const granted = access ?? []
  const grantedUserIds = new Set(granted.filter((a) => a.subject_type === 'user').map((a) => a.subject_id))
  const grantedTeamIds = new Set(granted.filter((a) => a.subject_type === 'team').map((a) => a.subject_id))

  // Quien ya tiene acceso no se ofrece de nuevo. Los roles restringidos sí
  // aparecen aunque el nodo sea público: para ellos "público" no significa
  // abierto, necesitan concesión igual (ver 0031/0035).
  const candidatePeople = (people ?? []).filter((p) => !grantedUserIds.has(p.id))
  const candidateTeams = (teams ?? []).filter((t) => !grantedTeamIds.has(t.id))

  function handleAdd() {
    if (!toAdd) return
    const [subjectType, subjectId] = toAdd.split(':') as ['user' | 'team', string]
    if (!subjectId) return
    grant.mutate({ subjectType, subjectId }, { onSuccess: () => setToAdd('') })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acceso a {nodeName}</DialogTitle>
          <DialogDescription>
            Define quién puede ver {kindArticle} {kindLabel} y {contentsLabel}.
          </DialogDescription>
        </DialogHeader>

        {/* Privacidad. El texto explica la consecuencia real de cada estado en
            vez de solo nombrarlo — "privado" no dice por sí solo que los
            administradores siguen viendo todo. */}
        <div className="flex items-start gap-2.5 rounded-md border border-border p-3">
          <HugeiconsIcon
            icon={isPrivate ? LockIcon : Globe02Icon}
            className="mt-0.5 size-4 shrink-0 text-text-muted"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {isPrivate ? `${capitalize(kindLabel)} privad${kindAdjSuffix}` : `${capitalize(kindLabel)} abiert${kindAdjSuffix}`}
            </p>
            <p className="text-xs text-text-secondary">
              {isPrivate
                ? 'Solo quienes estén en la lista de abajo, más los administradores.'
                : 'Todo el workspace puede verlo, salvo los roles restringidos, que necesitan estar en la lista.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={setPrivacy.isPending}
            onClick={() => setPrivacy.mutate({ nodeId, isPrivate: !isPrivate })}
          >
            {isPrivate ? 'Hacer abierto' : 'Hacer privado'}
          </Button>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="node-access-add" className="text-xs font-medium text-text-muted">
              Dar acceso a
            </label>
            <Select value={toAdd} onValueChange={setToAdd}>
              <SelectTrigger id="node-access-add">
                <SelectValue placeholder="Elige una persona o equipo" />
              </SelectTrigger>
              <SelectContent>
                {candidateTeams.length > 0 && (
                  <>
                    <SelectItem value="__teams" disabled>
                      Equipos
                    </SelectItem>
                    {candidateTeams.map((t) => (
                      <SelectItem key={t.id} value={`team:${t.id}`}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </>
                )}
                {candidatePeople.length > 0 && (
                  <>
                    <SelectItem value="__people" disabled>
                      Personas
                    </SelectItem>
                    {candidatePeople.map((p) => (
                      <SelectItem key={p.id} value={`user:${p.id}`}>
                        {p.full_name ?? p.email}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!toAdd || toAdd.startsWith('__') || grant.isPending}>
            <HugeiconsIcon icon={PlusSignIcon} />
            Añadir
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-text-muted uppercase">Con acceso explícito</span>
          {isPending ? (
            <Skeleton className="h-16" />
          ) : granted.length === 0 ? (
            <p className="text-xs text-text-muted">
              {isPrivate
                ? 'Nadie todavía: solo los administradores pueden verlo.'
                : 'Nadie con acceso explícito — no hace falta mientras el nodo esté abierto.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {granted.map((entry) => {
                const team = entry.subject_type === 'team' ? teams?.find((t) => t.id === entry.subject_id) : undefined
                const person =
                  entry.subject_type === 'user' ? people?.find((p) => p.id === entry.subject_id) : undefined
                const label = team?.name ?? person?.full_name ?? person?.email ?? 'Desconocido'
                return (
                  <li
                    key={`${entry.subject_type}:${entry.subject_id}`}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1"
                  >
                    {entry.subject_type === 'team' ? (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-alt">
                        <HugeiconsIcon icon={UserGroupIcon} className="size-3.5 text-text-muted" />
                      </span>
                    ) : (
                      <Avatar size="sm">
                        {person?.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
                        <AvatarFallback className="text-[10px]">{initials(person?.full_name ?? null)}</AvatarFallback>
                      </Avatar>
                    )}
                    <span className={cn('min-w-0 flex-1 truncate text-sm', !team && !person && 'text-text-muted')}>
                      {label}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Quitar acceso de ${label}`}
                      onClick={() =>
                        revoke.mutate({ subjectType: entry.subject_type, subjectId: entry.subject_id })
                      }
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {kind === 'task' && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-sm">
                <HugeiconsIcon icon={Globe02Icon} className="size-4 text-text-muted" />
                Link público
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
            <p className="-mt-2 text-xs text-text-muted">
              Quien reciba este enlace la ve sin cuenta — solo puede mirar, no editar.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
