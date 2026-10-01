import { useMemo } from 'react'
import { isToday, isYesterday, parseISO } from 'date-fns'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  PlusSignIcon,
  Delete02Icon,
  CheckmarkCircle02Icon,
  UserMultiple02Icon,
  Flag01Icon,
  Calendar01Icon,
  Edit02Icon,
} from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { describeActivity, type ActivityContext } from '@/features/activity/describe'
import { activityIconKind, type ActivityIconKind } from '@/features/activity/activity-icon'
import type { ActivityEntry } from '@/features/activity/queries'
import { formatRelativeTime, formatShortDate } from '@/lib/format-date'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

const ICON_BY_KIND: Record<ActivityIconKind, { icon: IconSvgElement; className: string }> = {
  created: { icon: PlusSignIcon, className: 'bg-success' },
  deleted: { icon: Delete02Icon, className: 'bg-danger' },
  status: { icon: CheckmarkCircle02Icon, className: 'bg-accent' },
  assignee: { icon: UserMultiple02Icon, className: 'bg-tag-violeta' },
  priority: { icon: Flag01Icon, className: 'bg-tag-ambar' },
  date: { icon: Calendar01Icon, className: 'bg-tag-azul' },
  generic: { icon: Edit02Icon, className: 'bg-text-muted' },
}

function dayLabel(iso: string): string {
  const date = parseISO(iso)
  if (isToday(date)) return 'Hoy'
  if (isYesterday(date)) return 'Ayer'
  return formatShortDate(iso)
}

interface ActivityFeedProps {
  entries: ActivityEntry[]
  context: ActivityContext
  emptyLabel: string
}

// Reemplaza la vieja lista de líneas de texto plano grises (sin ninguna
// jerarquía visual, "quién" y "qué tipo de cambio" mezclados en una
// misma oración) — mockup revisado y aprobado con el usuario antes de
// construir esto. Avatar de quien actuó + insignia de color según el
// tipo de cambio (estado/responsable/prioridad/fecha/creación/borrado,
// ver activity-icon.ts) + una línea vertical conectando las entradas +
// agrupado por día en vez de repetir "hace X" como único dato temporal.
// `describeActivity` (describe.ts) sigue siendo la única fuente del
// texto — esto solo lo envuelve visualmente, no le cambia el contrato.
export function ActivityFeed({ entries, context, emptyLabel }: ActivityFeedProps) {
  const withDayFlag = useMemo(() => {
    let last: string | null = null
    return entries.map((entry) => {
      const label = dayLabel(entry.created_at)
      const showLabel = label !== last
      last = label
      return { entry, label, showLabel }
    })
  }, [entries])

  if (entries.length === 0) {
    return <p className="text-sm text-text-muted">{emptyLabel}</p>
  }

  return (
    <div>
      {withDayFlag.map(({ entry, label, showLabel }, i) => {
        const { icon, className } = ICON_BY_KIND[activityIconKind(entry)]
        const isLast = i === withDayFlag.length - 1
        return (
          <div key={entry.id}>
            {showLabel && (
              <div
                className={cn(
                  'mb-2.5 font-mono text-[10px] font-bold tracking-wide text-text-muted uppercase',
                  i > 0 && 'mt-4',
                )}
              >
                {label}
              </div>
            )}
            <div
              className={cn(
                'relative flex gap-2.5',
                !isLast && "pb-3.5 after:absolute after:top-[27px] after:bottom-0 after:left-[13px] after:w-px after:bg-border after:content-['']",
              )}
            >
              <div className="relative z-10 shrink-0">
                <Avatar size="sm">
                  {entry.actor?.avatar_url && <AvatarImage src={entry.actor.avatar_url} alt="" />}
                  <AvatarFallback>{initials(entry.actor?.full_name ?? null)}</AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    'absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full text-white',
                    className,
                  )}
                >
                  <HugeiconsIcon icon={icon} className="size-2" />
                </span>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs leading-relaxed text-text-secondary">{describeActivity(entry, context)}</p>
                <span className="text-[11px] text-text-muted">{formatRelativeTime(entry.created_at)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
