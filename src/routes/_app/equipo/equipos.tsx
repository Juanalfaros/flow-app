import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserGroupIcon, PlusSignIcon, Edit02Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useTeams, useTeamWorkload, type TeamSummary } from '@/features/teams/queries'
import { useCreateTeamMutation, normalizeHandle } from '@/features/teams/mutations'
import { EditTeamDialog } from '@/features/teams/components/EditTeamDialog'
import { useSetPersonSearchParam } from '@/features/people/person-param'
import { useSetTeamSearchParam } from '@/features/teams/team-param'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/equipo/equipos')({
  component: EquiposPage,
})

function EquiposPage() {
  const { workspaceId, role } = useCurrentWorkspace()
  const { data: teams, isPending } = useTeams(workspaceId)
  const workloadByTeam = useTeamWorkload(workspaceId)
  const isAdmin = role === 'owner' || role === 'admin'

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Los equipos agrupan personas para filtrar, mencionar y organizar el trabajo.
        </p>
        {/* Espeja `teams_write_admin` (0025): es UI, no autorización — la policy
            sigue siendo la que decide, esto solo evita ofrecer un botón que va
            a rebotar con 42501. */}
        {isAdmin && workspaceId && <CreateTeamDialog workspaceId={workspaceId} />}
      </div>

      {isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-card" />
          ))}
        </div>
      ) : (teams ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-card border border-dashed border-border py-12 text-center">
          <HugeiconsIcon icon={UserGroupIcon} className="size-5 text-text-muted/60" />
          <p className="text-sm text-text-muted">
            {isAdmin ? 'Todavía no hay equipos. Crea el primero.' : 'Todavía no hay equipos.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {(teams ?? []).map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              workspaceId={workspaceId}
              isAdmin={isAdmin}
              workload={workloadByTeam.get(team.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TeamCard({
  team,
  workspaceId,
  isAdmin,
  workload,
}: {
  team: TeamSummary
  workspaceId: string
  isAdmin: boolean
  workload: { openCount: number; overdueCount: number; projectCount: number } | undefined
}) {
  const setPerson = useSetPersonSearchParam()
  const setTeam = useSetTeamSearchParam()
  const [editOpen, setEditOpen] = useState(false)
  const shown = team.members.slice(0, 5)
  const extra = team.members.length - shown.length

  return (
    // Corrección 4 de la maqueta: la tarjeta entera abre la ficha del
    // equipo (misma columna derecha que Personas, PR3) — antes solo los
    // avatares y el ícono de editar eran interactivos, el resto de la
    // tarjeta no hacía nada al tocarla. `role="button"` en un <div>, no
    // un <button> real: la tarjeta contiene OTROS botones adentro
    // (editar, cada avatar) — anidar <button> dentro de <button> es HTML
    // inválido y rompe el layout de clics.
    <div
      role="button"
      tabIndex={0}
      onClick={() => setTeam(team.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setTeam(team.id)
        }
      }}
      className="flex cursor-pointer flex-col gap-2 rounded-card border border-border bg-surface p-3 text-left shadow-card transition-colors hover:border-border-strong"
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-accent-foreground"
          style={{ backgroundColor: team.color ?? 'var(--accent)' }}
        >
          {team.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{team.name}</h2>
          <p className="truncate text-xs text-text-muted">@{team.handle}</p>
        </div>
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Editar equipo ${team.name}`}
            onClick={(e) => {
              e.stopPropagation()
              setEditOpen(true)
            }}
          >
            <HugeiconsIcon icon={Edit02Icon} />
          </Button>
        )}
        {isAdmin && editOpen && (
          // Montado solo cuando está abierto — mismo criterio que el resto
          // de diálogos de administración de esta app.
          <EditTeamDialog team={team} workspaceId={workspaceId} open={editOpen} onOpenChange={setEditOpen} />
        )}
      </div>

      {team.description && <p className="line-clamp-2 text-xs text-text-secondary">{team.description}</p>}

      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-2">
          {shown.map((m) => (
            <span
              key={m.user_id}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                setPerson(m.user_id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  e.preventDefault()
                  setPerson(m.user_id)
                }
              }}
              title={m.profile?.full_name ?? 'Sin nombre'}
              className="rounded-full ring-2 ring-surface transition-transform hover:z-10 hover:scale-110"
            >
              <Avatar size="sm">
                {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} alt="" />}
                <AvatarFallback className="text-[10px]">{initials(m.profile?.full_name ?? null)}</AvatarFallback>
              </Avatar>
            </span>
          ))}
        </div>
        <span className="text-xs text-text-muted">
          {team.members.length === 0
            ? 'Sin miembros'
            : `${team.members.length} ${team.members.length === 1 ? 'miembro' : 'miembros'}`}
          {extra > 0 && ` (+${extra})`}
        </span>
      </div>

      {/* Corrección 4 de la maqueta: un equipo deja de ser una lista de
          caras y pasa a ser una unidad de trabajo observable — mismos 3
          números que la ficha (useTeamWorkload, PR1). */}
      <div className="mt-auto flex gap-3 border-t border-border pt-2 text-xs">
        <span>
          <b className="font-semibold tabular-nums">{workload?.openCount ?? 0}</b>{' '}
          <span className="text-text-muted">abiertas</span>
        </span>
        <span className={cn(workload && workload.overdueCount > 0 && 'text-danger')}>
          <b className="font-semibold tabular-nums">{workload?.overdueCount ?? 0}</b>{' '}
          <span className={cn(!(workload && workload.overdueCount > 0) && 'text-text-muted')}>atrasadas</span>
        </span>
        <span>
          <b className="font-semibold tabular-nums">{workload?.projectCount ?? 0}</b>{' '}
          <span className="text-text-muted">listas</span>
        </span>
      </div>
    </div>
  )
}

function CreateTeamDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  // El handle se sugiere desde el nombre pero queda editable: quien escribe
  // "Diseño y Marca" casi siempre quiere @diseno-y-marca, y tener que
  // escribirlo dos veces es fricción sin ganancia.
  const [handle, setHandle] = useState('')
  const mutation = useCreateTeamMutation(workspaceId)

  const effectiveHandle = normalizeHandle(handle || name)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setName('')
          setHandle('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <HugeiconsIcon icon={PlusSignIcon} />
          Crear equipo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Crear equipo</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim() || !effectiveHandle) return
            mutation.mutate(
              { name, handle: effectiveHandle },
              {
                onSuccess: () => {
                  toast.success(`Equipo ${name.trim()} creado`)
                  setOpen(false)
                  setName('')
                  setHandle('')
                },
              },
            )
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-name">Nombre</Label>
            <Input
              id="team-name"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Brand"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-handle">Identificador</Label>
            <Input
              id="team-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={effectiveHandle || 'brand'}
              aria-describedby="team-handle-hint"
            />
            <span id="team-handle-hint" className="text-xs text-text-muted">
              {effectiveHandle ? `Se usará @${effectiveHandle}` : 'Se genera desde el nombre si lo dejas vacío.'}
            </span>
          </div>
          <Button type="submit" disabled={mutation.isPending || !name.trim()}>
            {mutation.isPending ? 'Creando…' : 'Crear equipo'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
