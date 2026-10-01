import { useMemo } from 'react'
import { addDays, format as formatDate, isAfter, isToday, isTomorrow, parseISO, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useTimeOff, isAwayOn, TIME_OFF_KIND_LABEL } from '@/features/people/time-off'
import { useWeekMilestones } from '@/features/home/queries'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { formatShortDate } from '@/lib/format-date'
import { getWeekDays, toDateKey } from '@/features/calendar/date-utils'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

const MAX_SHOWN = 4
// Ausencias que empiezan más adelante que esto no son "lo que viene" todavía
// — mismo criterio de "esta semana" que el resto de Inicio, para no listar
// unas vacaciones de dentro de dos meses junto a lo urgente.
const UPCOMING_AWAY_WINDOW_DAYS = 7

interface TeamItem {
  key: string
  avatar: { name: string | null; url: string | null } | 'milestone'
  title: string
  subtitle: string
  onOpen?: () => void
}

interface TeamSectionProps {
  workspaceId: string
  userId: string | undefined
}

// "Tu equipo" (mockup https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy):
// quién no está hoy, quién se va pronto, y los próximos hitos de la
// semana — construido con datos que Equipo (time_off) y "Esta semana"
// (is_milestone) ya cargan, sin tabla nueva. Se reusa exactamente
// `weekMilestonesQueryOptions` de WeekStripSection.tsx: mismo rango
// (`getWeekDays`), así que si esa sección ya montó primero esto es un
// cache hit, no un segundo viaje a la red.
export function TeamSection({ workspaceId, userId }: TeamSectionProps) {
  const setNode = useSetNodeSearchParam()
  const { data: members } = useWorkspaceMembers(workspaceId)
  const { data: timeOff } = useTimeOff(workspaceId)
  const weekDays = useMemo(() => getWeekDays(new Date()), [])
  const { data: milestones } = useWeekMilestones(workspaceId, toDateKey(weekDays[0]), toDateKey(weekDays[6]))

  const items = useMemo<TeamItem[]>(() => {
    const today = startOfDay(new Date())
    const rows = timeOff ?? []
    const result: TeamItem[] = []

    for (const row of rows) {
      if (row.user_id === userId) continue // ya se ve en "Esta semana", como MI ausencia
      const member = members?.find((m) => m.user_id === row.user_id)
      const name = member?.profile?.full_name ?? 'Alguien'
      const away = isAwayOn([row], today)
      if (away) {
        result.push({
          key: `away-${row.id}`,
          avatar: { name, url: member?.profile?.avatar_url ?? null },
          title: `${name} no está hoy`,
          subtitle: `${TIME_OFF_KIND_LABEL[row.kind] ?? 'Ausente'} hasta ${formatShortDate(row.ends_on)}`,
        })
        continue
      }
      const startsOn = parseISO(row.starts_on)
      if (isAfter(startsOn, today) && !isAfter(startsOn, addDays(today, UPCOMING_AWAY_WINDOW_DAYS))) {
        const when = isTomorrow(startsOn) ? 'mañana' : `el ${formatDate(startsOn, 'EEEE d', { locale: es })}`
        result.push({
          key: `upcoming-${row.id}`,
          avatar: { name, url: member?.profile?.avatar_url ?? null },
          title: `${name} sale ${when}`,
          subtitle: `Hasta el ${formatShortDate(row.ends_on)}`,
        })
      }
    }

    for (const m of milestones ?? []) {
      const due = parseISO(m.due_date)
      const when = isToday(due) ? 'hoy' : isTomorrow(due) ? 'mañana' : formatDate(due, 'EEEE d', { locale: es })
      result.push({
        key: `milestone-${m.id}`,
        avatar: 'milestone',
        title: `${m.title}, ${when}`,
        subtitle: 'Hito',
        onOpen: () => setNode(m.id),
      })
    }

    return result.slice(0, MAX_SHOWN)
  }, [timeOff, members, milestones, userId, setNode])

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Tu equipo</h2>
        <span className="text-xs text-text-muted">hoy y lo que viene</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-alt/40 px-4 py-6 text-center text-sm text-text-muted">
          Todo tu equipo está disponible esta semana.
        </p>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => (
            <div
              key={item.key}
              className={cn(
                'grid grid-cols-[26px_minmax(0,1fr)] items-start gap-2.5 py-2.5 not-first:border-t not-first:border-border',
                item.onOpen && 'cursor-pointer',
              )}
              onClick={item.onOpen}
            >
              {item.avatar === 'milestone' ? (
                <span className="grid size-[26px] place-items-center rounded-full bg-accent-soft text-accent-text-on-bg">◆</span>
              ) : (
                <Avatar size="sm">
                  {item.avatar.url && <AvatarImage src={item.avatar.url} alt="" />}
                  <AvatarFallback>{initials(item.avatar.name)}</AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-text">{item.title}</p>
                <span className="text-[11.5px] text-text-muted">{item.subtitle}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
