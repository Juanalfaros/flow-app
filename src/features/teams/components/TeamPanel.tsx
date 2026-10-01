import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useProjects } from '@/features/projects/queries'
import { useTeam, useTeamWorkload } from '@/features/teams/queries'
import { EditTeamDialog } from '@/features/teams/components/EditTeamDialog'
import { useSetPersonSearchParam } from '@/features/people/person-param'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

/**
 * Ficha de equipo (rediseño de Equipo, PR4, 2026-09-24) — mismo lugar
 * (columna derecha de equipo/route.tsx) y mismo patrón visual que
 * PersonPanel, pero sin pestañas: acá el contenido cabe en una sola
 * pantalla (métricas + miembros). Tocar un miembro abre SU ficha en la
 * misma columna (person-param.ts ya limpia `equipo` al setear `persona`).
 */
export function TeamPanel({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const { workspaceId, role } = useCurrentWorkspace()
  const { data: team, isPending } = useTeam(teamId)
  const { data: projects } = useProjects(workspaceId)
  const workloadByTeam = useTeamWorkload(workspaceId)
  const setPerson = useSetPersonSearchParam()
  const [editOpen, setEditOpen] = useState(false)
  const isAdmin = role === 'owner' || role === 'admin'

  const projectNameById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  if (isPending) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <Skeleton className="size-10 rounded-lg" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-24" />
      </div>
    )
  }

  if (!team) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-text-secondary">Este equipo ya no existe.</p>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    )
  }

  const workload = workloadByTeam.get(team.id)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-start gap-3 p-5 pb-4">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-accent-foreground"
          style={{ backgroundColor: team.color ?? 'var(--accent)' }}
        >
          {team.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">{team.name}</h2>
          <p className="truncate text-sm text-text-secondary">@{team.handle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {isAdmin && (
            <Button variant="ghost" size="icon-sm" aria-label="Editar equipo" onClick={() => setEditOpen(true)}>
              <HugeiconsIcon icon={Edit02Icon} />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Cerrar ficha" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>
      </div>

      {isAdmin && editOpen && (
        <EditTeamDialog team={team} workspaceId={workspaceId} open={editOpen} onOpenChange={setEditOpen} />
      )}

      {team.description && <p className="px-5 pb-4 text-sm text-text-secondary">{team.description}</p>}

      {/* Corrección 4 de la maqueta: un equipo deja de ser una lista de
          caras y pasa a ser una unidad de trabajo observable — estos tres
          números salen de useTeamWorkload (PR1), sumando el
          useWorkloadByPerson de cada integrante. */}
      <div className="flex gap-4 border-y border-border px-5 py-3 text-sm">
        <Metric label="abiertas" value={workload?.openCount ?? 0} />
        <Metric label="atrasadas" value={workload?.overdueCount ?? 0} tone={workload && workload.overdueCount > 0 ? 'danger' : undefined} />
        <Metric label="listas" value={workload?.projectCount ?? 0} />
      </div>

      {workload && workload.projectIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 py-3">
          {workload.projectIds.map((projectId) => (
            <span key={projectId} className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] text-text-secondary">
              {projectNameById.get(projectId) ?? '—'}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 p-5 pt-3">
        <h3 className="mb-1 text-[10.5px] font-medium tracking-wide text-text-muted uppercase">
          {team.members.length === 0 ? 'Sin miembros' : `${team.members.length} miembro${team.members.length === 1 ? '' : 's'}`}
        </h3>
        <ul className="flex flex-col divide-y divide-border">
          {team.members.map((m) => (
            <li key={m.user_id}>
              <button
                type="button"
                onClick={() => setPerson(m.user_id)}
                className="flex w-full items-center gap-2.5 rounded-md py-2 text-left hover:bg-surface-alt"
              >
                <Avatar size="sm">
                  {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} alt="" />}
                  <AvatarFallback className="text-[10px]">{initials(m.profile?.full_name ?? null)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.profile?.full_name ?? 'Sin nombre'}</span>
                  {m.profile?.job_title && <span className="block truncate text-xs text-text-muted">{m.profile.job_title}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div>
      <div className={cn('text-sm font-semibold tabular-nums', tone === 'danger' && value > 0 && 'text-danger')}>{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}
