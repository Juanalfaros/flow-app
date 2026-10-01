import { Link, useMatchRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserGroupIcon } from '@hugeicons/core-free-icons'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useTeams } from '@/features/teams/queries'
import { cn } from '@/lib/utils'

const navItemClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-surface-alt transition-colors'
const activeNavItemClass = 'text-accent font-medium'

export function EquipoPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaceId } = useCurrentWorkspace()
  const matchRoute = useMatchRoute()
  const { data: teams } = useTeams(workspaceId ?? '')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Link
          to="/equipo/personas"
          onClick={onNavigate}
          className={cn(navItemClass, !!matchRoute({ to: '/equipo/personas' }) && activeNavItemClass)}
        >
          <HugeiconsIcon icon={UserGroupIcon} className="size-4 shrink-0" />
          Personas
        </Link>
        <Link
          to="/equipo/equipos"
          onClick={onNavigate}
          className={cn(navItemClass, 'py-1 pl-8 text-xs', !!matchRoute({ to: '/equipo/equipos' }) && activeNavItemClass)}
        >
          Equipos
        </Link>
        <Link
          to="/equipo/organigrama"
          onClick={onNavigate}
          className={cn(
            navItemClass,
            'py-1 pl-8 text-xs',
            !!matchRoute({ to: '/equipo/organigrama' }) && activeNavItemClass,
          )}
        >
          Organigrama
        </Link>
      </div>

      {teams && teams.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Equipos</span>
          {teams.map((team) => (
            <Link
              key={team.id}
              to="/equipo/equipos"
              onClick={onNavigate}
              className={cn(navItemClass, 'justify-between')}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-semibold text-white"
                  style={{ backgroundColor: team.color ?? undefined }}
                >
                  {team.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="truncate">{team.name}</span>
              </span>
              <span className="font-mono text-xs text-text-muted tabular-nums">{team.members.length}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
