import { useMemo } from 'react'
import { formatShortDate, formatRelativeTime } from '@/lib/format-date'
import type { ReportMilestone } from '@/features/reports/report-data'
import { HEALTH_CLASS, HEALTH_LABEL, computeHealth } from '@/features/reports/report-colors'
import { cn } from '@/lib/utils'

const DAYS_BACK = 4
const DAYS_FWD = 30

export function ReportMilestones({ milestones }: { milestones: ReportMilestone[] }) {
  const points = useMemo(() => {
    const now = Date.now()
    return milestones.map((m) => {
      const offsetDays = Math.round((new Date(m.dueDate).getTime() - now) / 86_400_000)
      const overdue = offsetDays < 0
      const health = computeHealth({
        totalCount: 1, openCount: 1, overdueCount: overdue ? 1 : 0, blockedCount: m.predTotal - m.predDone,
        milestoneOverdue: overdue, milestoneDueDate: m.dueDate,
      })
      return { ...m, offsetDays, overdue, health }
    })
  }, [milestones])

  if (points.length === 0) {
    return <p className="py-6 text-center text-sm text-text-muted">Sin hitos próximos ni vencidos.</p>
  }

  const from = -DAYS_BACK
  const to = DAYS_FWD
  const pos = (offset: number) => `${Math.max(0, Math.min(100, ((offset - from) / (to - from)) * 100))}%`

  const ticks = [
    { offset: 0, label: 'hoy' },
    { offset: Math.round((to - from) / 3), label: formatShortDate(new Date(Date.now() + (Math.round((to - from) / 3)) * 86_400_000).toISOString()) },
    { offset: Math.round((2 * (to - from)) / 3), label: formatShortDate(new Date(Date.now() + (Math.round((2 * (to - from)) / 3)) * 86_400_000).toISOString()) },
    { offset: to, label: formatShortDate(new Date(Date.now() + to * 86_400_000).toISOString()) },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-1 h-14">
        <div className="absolute top-6 right-0 left-0 h-0.5 rounded-full bg-border" />
        {ticks.map((t) => (
          <span key={t.offset} className="absolute top-8 -translate-x-1/2 font-mono text-[10.5px] whitespace-nowrap text-text-muted" style={{ left: pos(t.offset) }}>
            {t.label}
          </span>
        ))}
        <span className="absolute top-1 bottom-6 w-0.5 -translate-x-1/2 rounded-full bg-accent" style={{ left: pos(0) }}>
          <span className="absolute -top-0.5 left-1.5 font-mono text-[10px] whitespace-nowrap text-accent">hoy</span>
        </span>
        {points.map((m) => (
          <span
            key={m.id}
            title={`${m.title} · ${formatShortDate(m.dueDate)} · ${HEALTH_LABEL[m.health]}`}
            className="absolute top-5 size-3.5 -translate-x-1/2 rotate-45 rounded-[3px] border-2 border-surface"
            style={{ left: pos(m.offsetDays), background: `var(--status-${m.health === 'bad' ? 'blocked' : m.health === 'warn' ? 'inreview' : 'done'})` }}
          />
        ))}
      </div>

      <div className="flex flex-col">
        {points.map((m) => (
          <div key={m.id} className="grid grid-cols-[58px_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border py-2 text-[13px] last:border-b-0">
            <span className={cn('font-mono text-xs', m.overdue && 'text-danger')}>{formatShortDate(m.dueDate)}</span>
            <span className="min-w-0">
              <b className="block truncate font-medium">{m.title}</b>
              <small className="text-xs text-text-muted">
                {[m.spaceTitle, m.projectTitle].filter(Boolean).join(' › ')} · {m.overdue ? `venció ${formatRelativeTime(m.dueDate)}` : formatRelativeTime(m.dueDate)}
              </small>
            </span>
            <span className="font-mono text-[11.5px] whitespace-nowrap text-text-secondary" title="Tareas predecesoras terminadas">
              {m.predDone} de {m.predTotal} previas
            </span>
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap', HEALTH_CLASS[m.health])}>
              {HEALTH_LABEL[m.health]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
