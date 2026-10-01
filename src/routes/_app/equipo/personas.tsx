import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon, GridViewIcon, ListViewIcon, UserMultiple02Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { usePeople, formatLocalTime, type Person } from '@/features/people/queries'
import { useTeams, useTeamsByUser, type TeamSummary } from '@/features/teams/queries'
import { useSetPersonSearchParam } from '@/features/people/person-param'
import { useOnlineUserIds } from '@/features/people/use-workspace-presence'
import { useTimeOff, isAwayOn } from '@/features/people/time-off'
import { useWorkloadByPerson, type PersonWorkload } from '@/features/reports/queries'
import { ROLE_LABEL } from '@/features/workspace/roles'
import { formatShortDate } from '@/lib/format-date'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/equipo/personas')({
  component: PersonasPage,
})

type ViewMode = 'list' | 'grid'

// Rediseño de Equipo (2026-09-24, maqueta:
// https://claude.ai/artifact/6B28WSrkGgAN2tRkH7UGyX). Filas por defecto
// (antes "grid" con foto cuadrada) — es la vista que responde "quién está,
// cuánto tiene encima y cómo se le llega" sin abrir cada tarjeta. La vista
// de tarjetas se mantiene como opción, con avatar chico en vez de foto.
function PersonasPage() {
  const { workspaceId } = useCurrentWorkspace()
  const { data: people, isPending } = usePeople(workspaceId)
  const { data: teams } = useTeams(workspaceId)
  const { data: teamsByUser } = useTeamsByUser(workspaceId)
  const { data: timeOff } = useTimeOff(workspaceId)
  const { data: workload } = useWorkloadByPerson(workspaceId)
  const onlineIds = useOnlineUserIds()
  const setPerson = useSetPersonSearchParam()

  const [query, setQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [view, setView] = useState<ViewMode>('list')

  const workloadByUser = useMemo(() => new Map((workload ?? []).map((w) => [w.userId, w])), [workload])
  // Referencia para la barra de carga: el máximo real de abiertas entre
  // todo el workspace, no un techo arbitrario — así "más cargado" siempre
  // se lee como la barra más llena, sin importar cuántas tareas maneje el
  // estudio en total.
  const maxOpen = useMemo(() => Math.max(1, ...(workload ?? []).map((w) => w.openCount)), [workload])

  // Filtrado y orden en cliente: son ~15 personas en una sola query ya
  // cacheada. Un round-trip por cada tecla del buscador costaría más —en
  // latencia y en cuota de requests— que recorrer un array de 15.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (people ?? []).filter((p) => {
      if (roleFilter !== 'all' && p.role !== roleFilter) return false
      if (teamFilter !== 'all' && !(teamsByUser?.get(p.id) ?? []).some((t) => t.id === teamFilter)) return false
      if (!q) return true
      return (
        (p.full_name ?? '').toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.job_title ?? '').toLowerCase().includes(q)
      )
    })
  }, [people, query, roleFilter, teamFilter, teamsByUser])

  const onlineCount = (people ?? []).filter((p) => onlineIds.has(p.id)).length
  const awayCount = (people ?? []).filter((p) => isAwayOn(timeOff?.filter((t) => t.user_id === p.id) ?? [])).length

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-lg font-medium">Personas</h1>
        {!isPending && people && (
          <p className="mt-1 text-sm text-text-muted">
            {people.length} en el workspace · {onlineCount} en línea
            {awayCount > 0 && ` · ${awayCount} ausente${awayCount === 1 ? '' : 's'}`}
          </p>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, correo o cargo"
            aria-label="Buscar personas"
            className="pl-8"
          />
        </div>

        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger size="sm" aria-label="Filtrar por equipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los equipos</SelectItem>
            {(teams ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger size="sm" aria-label="Filtrar por tipo de cuenta">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            {['owner', 'admin', 'member', 'guest'].map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r] ?? r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
          {(['list', 'grid'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              aria-label={mode === 'list' ? 'Ver como filas' : 'Ver como tarjetas'}
              aria-pressed={view === mode}
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text',
                view === mode && 'bg-surface-alt text-text',
              )}
            >
              <HugeiconsIcon icon={mode === 'list' ? ListViewIcon : GridViewIcon} className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="flex flex-col divide-y divide-border">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="my-1.5 h-12" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-12 text-center">
          <HugeiconsIcon icon={UserMultiple02Icon} className="size-5 text-text-muted/60" />
          <p className="text-sm text-text-muted">
            {people?.length === 0 ? 'Todavía no hay nadie en el workspace.' : 'Nadie coincide con esos filtros.'}
          </p>
        </div>
      ) : view === 'list' ? (
        <ul className="flex flex-col divide-y divide-border">
          {filtered.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              teams={teamsByUser?.get(person.id) ?? []}
              isOnline={onlineIds.has(person.id)}
              away={isAwayOn(timeOff?.filter((t) => t.user_id === person.id) ?? [])}
              workload={workloadByUser.get(person.id)}
              maxOpen={maxOpen}
              onOpen={() => setPerson(person.id)}
            />
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {filtered.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              teamNames={(teamsByUser?.get(person.id) ?? []).map((t) => t.name)}
              isOnline={onlineIds.has(person.id)}
              onOpen={() => setPerson(person.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PersonRow({
  person,
  teams,
  isOnline,
  away,
  workload,
  maxOpen,
  onOpen,
}: {
  person: Person
  teams: TeamSummary[]
  isOnline: boolean
  away: ReturnType<typeof isAwayOn>
  workload: PersonWorkload | undefined
  maxOpen: number
  onOpen: () => void
}) {
  const dotClass = away ? 'bg-warn' : isOnline ? 'bg-success' : 'bg-border-strong'
  const localTime = formatLocalTime(person.timezone)
  const openCount = workload?.openCount ?? 0
  const overdueCount = workload?.overdueCount ?? 0
  const barWidth = `${Math.max(4, Math.round((openCount / maxOpen) * 100))}%`

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 px-2 py-2.5 text-left hover:bg-surface-alt"
      >
        <span className="relative shrink-0">
          <Avatar>
            {person.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
            <AvatarFallback>{initials(person.full_name)}</AvatarFallback>
          </Avatar>
          <span
            className={cn('absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-surface', dotClass)}
            aria-hidden
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{person.full_name ?? 'Sin nombre todavía'}</span>
          <span className="block truncate text-xs text-text-muted">
            {away
              ? `Vacaciones · vuelve el ${formatShortDate(away.ends_on)}`
              : [person.job_title, ROLE_LABEL[person.role] ?? person.role].filter(Boolean).join(' · ')}
          </span>
        </span>

        {teams.length > 0 && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-surface-alt px-2 py-0.5 text-[10px] text-text-secondary @min-[560px]:flex">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: teams[0]?.color ?? undefined }} />
            <span className="max-w-24 truncate">{teams.length > 1 ? `${teams[0]?.name} +${teams.length - 1}` : teams[0]?.name}</span>
          </span>
        )}

        {/* Barra de carga: Corrección 2/6 de la maqueta de Equipo — el dato
            de `useWorkloadByPerson` (PR1) que hoy solo vivía en Reportes,
            acá como la señal principal para ordenar "quién anda más
            cargado" sin salir de esta pantalla. */}
        <span className="hidden w-20 shrink-0 @min-[720px]:block">
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-alt">
            <span className="block h-full rounded-full bg-accent" style={{ width: barWidth }} />
          </span>
          <span className="mt-0.5 block text-[10px] text-text-muted">{openCount} abiertas</span>
        </span>

        <span className={cn('w-14 shrink-0 text-right text-xs', overdueCount > 0 ? 'font-medium text-danger' : 'text-text-muted')}>
          {overdueCount > 0 ? `${overdueCount} atr.` : '—'}
        </span>

        {localTime && (
          <span className="hidden w-12 shrink-0 text-right font-mono text-[11px] text-text-muted @min-[860px]:block">
            {localTime}
          </span>
        )}
      </button>
    </li>
  )
}

function PersonCard({
  person,
  teamNames,
  isOnline,
  onOpen,
}: {
  person: Person
  teamNames: string[]
  isOnline: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2.5 rounded-card border border-border bg-surface p-3 text-left shadow-card transition-colors hover:border-border-strong"
    >
      <span className="relative shrink-0">
        <Avatar size="lg">
          {person.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
          <AvatarFallback>{initials(person.full_name)}</AvatarFallback>
        </Avatar>
        {isOnline && (
          <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-surface bg-success" aria-hidden />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{person.full_name ?? 'Sin nombre todavía'}</span>
        <span className="truncate text-xs text-text-muted">
          {person.job_title ?? <span className="italic">Sin cargo</span>}
        </span>
        {teamNames.length > 0 && (
          <span className="truncate text-[10px] text-text-muted">{teamNames.join(' · ')}</span>
        )}
      </span>
    </button>
  )
}
