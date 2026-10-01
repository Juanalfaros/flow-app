import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { formatShortDate, formatRelativeTime } from '@/lib/format-date'
import type { PortfolioEntry, ReportSpace } from '@/features/reports/report-data'
import { STAGE_ORDER, STAGE_LABEL, HEALTH_LABEL, HEALTH_CLASS, computeHealth, spaceColor, type Health } from '@/features/reports/report-colors'
import { cn } from '@/lib/utils'

interface SpaceGroup {
  spaceId: string
  title: string
  color: string
  health: Health
  st: number[]
  openCount: number
  overdueCount: number
  ontimePct: number | null
  hours: number
  nextMilestone: PortfolioEntry['nextMilestone']
  weekly: number[]
  projects: PortfolioEntry[]
}

function groupBySpace(portfolio: PortfolioEntry[], spaces: ReportSpace[]): SpaceGroup[] {
  const spaceOrder = new Map(spaces.map((s, i) => [s.id, i]))
  const bySpace = new Map<string, PortfolioEntry[]>()
  for (const p of portfolio) {
    const list = bySpace.get(p.spaceId)
    if (list) list.push(p)
    else bySpace.set(p.spaceId, [p])
  }
  return [...bySpace.entries()]
    .map(([spaceId, projects]) => {
      const title = spaces.find((s) => s.id === spaceId)?.title ?? '—'
      const st = [0, 0, 0, 0, 0]
      let openCount = 0
      let overdueCount = 0
      let closedWithDueCount = 0
      let ontimeCount = 0
      let hours = 0
      const weekly = new Array(8).fill(0) as number[]
      let nextMilestone: PortfolioEntry['nextMilestone'] = null
      for (const p of projects) {
        st[0] = (st[0] ?? 0) + p.stSuccess
        st[1] = (st[1] ?? 0) + p.stWarning
        st[2] = (st[2] ?? 0) + p.stDanger
        st[3] = (st[3] ?? 0) + p.stNeutral
        st[4] = (st[4] ?? 0) + p.stDropped
        openCount += p.openCount
        overdueCount += p.overdueCount
        hours += p.hours
        closedWithDueCount += p.closedWithDueCount
        ontimeCount += p.ontimeCount
        p.weekly.forEach((v, i) => { weekly[i] = (weekly[i] ?? 0) + v })
        if (p.nextMilestone && (!nextMilestone || p.nextMilestone.dueDate < nextMilestone.dueDate)) {
          nextMilestone = p.nextMilestone
        }
      }
      const blockedCount = st[2] ?? 0
      const totalCount = st.reduce((a, b) => a + b, 0)
      const health = computeHealth({
        totalCount, openCount, overdueCount, blockedCount,
        milestoneOverdue: nextMilestone?.overdue ?? false,
        milestoneDueDate: nextMilestone?.dueDate ?? null,
      })
      return {
        spaceId,
        title,
        color: spaceColor(spaceOrder.get(spaceId) ?? 0),
        health,
        st,
        openCount,
        overdueCount,
        ontimePct: closedWithDueCount > 0 ? Math.round((100 * ontimeCount) / closedWithDueCount) : null,
        hours,
        nextMilestone,
        weekly,
        projects,
      }
    })
    .sort((a, b) => (spaceOrder.get(a.spaceId) ?? 0) - (spaceOrder.get(b.spaceId) ?? 0))
}

export function ReportPortfolio({ portfolio, spaces }: { portfolio: PortfolioEntry[]; spaces: ReportSpace[] }) {
  const groups = useMemo(() => groupBySpace(portfolio, spaces), [portfolio, spaces])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groups.slice(0, 1).map((g) => g.spaceId)))

  if (groups.length === 0) {
    return <p className="py-6 text-center text-sm text-text-muted">No hay tareas que reportar con estos filtros.</p>
  }

  return (
    <div>
      {/* Mobile: cada espacio/lista es un bloque, no una fila de tabla que
          hay que desplazar de lado — mismo criterio que el mockup
          ("Portafolio y Personas dejan de ser tablas"). La tendencia de 8
          semanas se oculta acá (mockup: "se oculta" en mobile). */}
      <div className="flex flex-col divide-y divide-border @min-[761px]:hidden">
        {groups.map((g) => (
          <MobilePortfolioGroup
            key={g.spaceId}
            group={g}
            expanded={expanded.has(g.spaceId)}
            onToggle={() =>
              setExpanded((prev) => {
                const next = new Set(prev)
                if (next.has(g.spaceId)) next.delete(g.spaceId)
                else next.add(g.spaceId)
                return next
              })
            }
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto @min-[761px]:block">
      <table className="w-full min-w-[900px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[10px] tracking-wide text-text-muted uppercase">
            <th className="pb-2 pr-2 font-medium">Espacio / lista</th>
            <th className="pb-2 pr-2 font-medium">Salud</th>
            <th className="pb-2 pr-2 font-medium">Avance</th>
            <th className="pb-2 pr-2 text-right font-medium">Abiertas</th>
            <th className="pb-2 pr-2 text-right font-medium">Vencidas</th>
            <th className="pb-2 pr-2 text-right font-medium">A tiempo</th>
            <th className="pb-2 pr-2 font-medium">Próximo hito</th>
            <th className="pb-2 pr-2 text-right font-medium">Horas</th>
            <th className="pb-2 font-medium">Cierres · 8 sem</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <PortfolioRows
              key={g.spaceId}
              group={g}
              expanded={expanded.has(g.spaceId)}
              onToggle={() =>
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(g.spaceId)) next.delete(g.spaceId)
                  else next.add(g.spaceId)
                  return next
                })
              }
            />
          ))}
        </tbody>
      </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        {STAGE_ORDER.map((kind, i) => (
          <span key={kind} className="flex items-center gap-1.5">
            <i className="inline-block size-2 rounded-sm" style={{ background: STAGE_DOT[i] }} aria-hidden />
            {STAGE_LABEL[kind]}
          </span>
        ))}
      </div>
    </div>
  )
}

function MobilePortfolioGroup({ group, expanded, onToggle }: { group: SpaceGroup; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      <MobilePortfolioCard
        title={
          <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 items-center gap-2">
            <HugeiconsIcon icon={ArrowRight01Icon} className={cn('size-3.5 shrink-0 text-text-muted transition-transform', expanded && 'rotate-90')} />
            <i className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: group.color }} aria-hidden />
            <span className="truncate font-medium">{group.title}</span>
          </button>
        }
        entry={group}
      />
      {expanded &&
        group.projects.map((p) => (
          <MobilePortfolioCard
            key={p.projectId}
            indent
            title={
              <Link to="/p/$projectId/list" params={{ projectId: p.projectId }} className="truncate text-text-secondary hover:underline">
                {p.title}
              </Link>
            }
            entry={{
              ...p,
              health: computeHealth({
                totalCount: p.stSuccess + p.stWarning + p.stDanger + p.stNeutral + p.stDropped,
                openCount: p.openCount, overdueCount: p.overdueCount, blockedCount: p.stDanger,
                milestoneOverdue: p.nextMilestone?.overdue ?? false, milestoneDueDate: p.nextMilestone?.dueDate ?? null,
              }),
              st: [p.stSuccess, p.stWarning, p.stDanger, p.stNeutral, p.stDropped],
            }}
          />
        ))}
    </div>
  )
}

function MobilePortfolioCard({
  title,
  entry,
  indent,
}: {
  title: React.ReactNode
  indent?: boolean
  entry: { health: Health; st: number[]; openCount: number; overdueCount: number; ontimePct: number | null; nextMilestone: PortfolioEntry['nextMilestone']; hours: number }
}) {
  const total = entry.st.reduce((a, b) => a + b, 0)
  const openTotal = entry.st[1]! + entry.st[2]! + entry.st[3]!
  const pct = total - entry.st[4]! > 0 ? Math.round((100 * entry.st[0]!) / (total - entry.st[4]!)) : 0

  return (
    <div className={cn('flex flex-col gap-2 py-3', indent && 'pl-6')}>
      <div className="flex items-center justify-between gap-2">
        {title}
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium', HEALTH_CLASS[entry.health])}>
          {HEALTH_LABEL[entry.health]}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex h-2 flex-1 gap-0.5 overflow-hidden rounded-sm">
          {entry.st.map((v, i) => (v > 0 ? <i key={i} className="block h-full" style={{ flex: v, background: STAGE_DOT[i] }} /> : null))}
        </span>
        <span className="font-mono text-[11.5px] text-text-secondary">{pct}%</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <MobileStat label="Abiertas">{openTotal}</MobileStat>
        <MobileStat label="Vencidas">{entry.overdueCount ? <span className="font-medium text-danger">{entry.overdueCount}</span> : '0'}</MobileStat>
        <MobileStat label="A tiempo">{entry.ontimePct === null ? '—' : `${entry.ontimePct}%`}</MobileStat>
        <MobileStat label="Horas">{entry.hours} h</MobileStat>
      </div>
      {entry.nextMilestone && (
        <p className="text-xs text-text-muted">
          Próximo hito: <span className="text-text-secondary">{entry.nextMilestone.title}</span>{' '}
          <span className={entry.nextMilestone.overdue ? 'text-danger' : ''}>
            ({formatShortDate(entry.nextMilestone.dueDate)} · {formatRelativeTime(entry.nextMilestone.dueDate)})
          </span>
        </p>
      )}
    </div>
  )
}

function MobileStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-mono text-[9.5px] tracking-wide text-text-muted uppercase">{label}</span>
      <span className="tabular-nums">{children}</span>
    </span>
  )
}

const STAGE_DOT = ['var(--status-done)', 'var(--status-inreview)', 'var(--status-blocked)', 'var(--status-todo)', 'var(--status-dropped)']

function PortfolioRows({ group, expanded, onToggle }: { group: SpaceGroup; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-border">
        <td className="py-2 pr-2 font-medium">
          <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex items-center gap-2">
            <HugeiconsIcon icon={ArrowRight01Icon} className={cn('size-3.5 shrink-0 text-text-muted transition-transform', expanded && 'rotate-90')} />
            <i className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: group.color }} aria-hidden />
            {group.title}
          </button>
        </td>
        <PortfolioCells entry={group} />
      </tr>
      {expanded &&
        group.projects.map((p) => (
          <tr key={p.projectId} className="border-b border-border bg-surface-alt/50">
            <td className="py-2 pr-2 pl-9 text-text-secondary">
              <Link to="/p/$projectId/list" params={{ projectId: p.projectId }} className="hover:underline">
                {p.title}
              </Link>
            </td>
            <PortfolioCells entry={{ ...p, health: computeHealth({
              totalCount: p.stSuccess + p.stWarning + p.stDanger + p.stNeutral + p.stDropped,
              openCount: p.openCount, overdueCount: p.overdueCount, blockedCount: p.stDanger,
              milestoneOverdue: p.nextMilestone?.overdue ?? false, milestoneDueDate: p.nextMilestone?.dueDate ?? null,
            }), st: [p.stSuccess, p.stWarning, p.stDanger, p.stNeutral, p.stDropped] }} />
          </tr>
        ))}
    </>
  )
}

function PortfolioCells({
  entry,
}: {
  entry: { health: Health; st: number[]; openCount: number; overdueCount: number; ontimePct: number | null; nextMilestone: PortfolioEntry['nextMilestone']; hours: number; weekly: number[] }
}) {
  const total = entry.st.reduce((a, b) => a + b, 0)
  const openTotal = entry.st[1]! + entry.st[2]! + entry.st[3]!
  const pct = total - entry.st[4]! > 0 ? Math.round((100 * entry.st[0]!) / (total - entry.st[4]!)) : 0
  const maxWeekly = Math.max(1, ...entry.weekly)

  return (
    <>
      <td className="py-2 pr-2">
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium', HEALTH_CLASS[entry.health])}>
          {HEALTH_LABEL[entry.health]}
        </span>
      </td>
      <td className="py-2 pr-2">
        <div className="flex items-center gap-2" title={STAGE_ORDER.map((k, i) => `${STAGE_LABEL[k]} ${entry.st[i]}`).join(' · ')}>
          <span className="flex h-2 w-[110px] gap-0.5 overflow-hidden rounded-sm">
            {entry.st.map((v, i) =>
              v > 0 ? <i key={i} className="block h-full" style={{ flex: v, background: STAGE_DOT[i] }} /> : null,
            )}
          </span>
          <span className="font-mono text-[11.5px] text-text-secondary">{pct}%</span>
        </div>
      </td>
      <td className="py-2 pr-2 text-right tabular-nums">{openTotal}</td>
      <td className="py-2 pr-2 text-right tabular-nums">
        {entry.overdueCount ? <span className="font-medium text-danger">{entry.overdueCount}</span> : <span className="text-text-muted">0</span>}
      </td>
      <td className="py-2 pr-2 text-right tabular-nums">{entry.ontimePct === null ? <span className="text-text-muted">—</span> : `${entry.ontimePct}%`}</td>
      <td className="py-2 pr-2">
        {entry.nextMilestone ? (
          <span className="flex flex-col leading-tight">
            <span className="truncate">{entry.nextMilestone.title}</span>
            <small className={cn('text-[11.5px] text-text-muted', entry.nextMilestone.overdue && 'text-danger')}>
              {formatShortDate(entry.nextMilestone.dueDate)} · {formatRelativeTime(entry.nextMilestone.dueDate)}
            </small>
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-2 text-right tabular-nums">{entry.hours} h</td>
      <td className="py-2">
        <svg viewBox="0 0 64 20" width="64" height="20" className="block" aria-hidden>
          <polyline
            points={entry.weekly.map((v, i) => `${(i * 60) / (entry.weekly.length - 1) + 2},${17 - (v / maxWeekly) * 14}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </td>
    </>
  )
}
