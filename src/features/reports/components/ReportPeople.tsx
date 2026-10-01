import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatShortDate } from '@/lib/format-date'
import type { PersonReportRow } from '@/features/reports/report-data'
import { PRIORITY_LABEL, PRIORITIES } from '@/features/tasks/priority'
import { initials } from '@/lib/initials'

const MAX_LOAD_BAR = 20
const MAX_HOURS_BAR = 45

const PRIORITY_DOT_VAR: Record<string, string> = {
  urgent: 'var(--danger)',
  high: 'var(--accent-2)',
  medium: 'var(--accent)',
  low: 'var(--text-muted)',
}

function priorityValues(p: PersonReportRow) {
  const byPriority: Record<string, number> = { urgent: p.urgent, high: p.high, medium: p.medium, low: p.low }
  return PRIORITIES.slice().reverse().map((pr) => byPriority[pr] ?? 0)
}

function LoadStack({ p, width }: { p: PersonReportRow; width?: string }) {
  const values = priorityValues(p)
  const total = values.reduce((a, b) => a + b, 0)
  return (
    <span className="flex items-center gap-2" title={PRIORITIES.slice().reverse().map((pr, i) => `${PRIORITY_LABEL[pr]} ${values[i]}`).join(' · ')}>
      <span
        className="flex h-2 gap-0.5 overflow-hidden rounded-sm"
        style={width ? { width } : { width: `${Math.max(24, (130 * total) / MAX_LOAD_BAR)}px` }}
      >
        {PRIORITIES.slice()
          .reverse()
          .map((pr, i) => (values[i] ? <i key={pr} className="block h-full" style={{ flex: values[i], background: PRIORITY_DOT_VAR[pr] }} /> : null))}
      </span>
      <span className="font-mono text-[12px] text-text-secondary">{total}</span>
    </span>
  )
}

function AwayChip({ p }: { p: PersonReportRow }) {
  if (!p.away) return <span className="text-text-muted">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2 py-0.5 text-xs text-warn-text">
      <HugeiconsIcon icon={Calendar01Icon} className="size-3" />
      {formatShortDate(p.away.startsOn)}–{formatShortDate(p.away.endsOn)}
    </span>
  )
}

export function ReportPeople({ people }: { people: PersonReportRow[] }) {
  if (people.length === 0) {
    return <p className="py-6 text-center text-sm text-text-muted">Nadie tiene tareas abiertas con estos filtros.</p>
  }

  return (
    <div>
      {/* Mobile: cada persona es un bloque (nombre+ausencia arriba, carga a
          todo el ancho, cifras en una fila con etiqueta) — mismo criterio
          que el mockup para Portafolio/Personas en mobile. */}
      <div className="flex flex-col divide-y divide-border @min-[761px]:hidden">
        {people.map((p) => (
          <div key={p.userId} className="flex flex-col gap-2 py-3">
            <span className="flex items-center gap-2.5">
              <Avatar size="sm">
                {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
                <AvatarFallback className="text-[10px]">{initials(p.fullName)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate font-medium">{p.fullName ?? 'Sin nombre'}</span>
            </span>
            {p.away && <AwayChip p={p} />}
            <LoadStack p={p} width="100%" />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <MobileStat label="Vencidas">{p.overdueCount ? <span className="font-medium text-danger">{p.overdueCount}</span> : '0'}</MobileStat>
              <MobileStat label="En 7 días">{p.dueSoonCount}</MobileStat>
              <MobileStat label="Horas">{p.hours} h</MobileStat>
              <MobileStat label="Revisiones">{p.reviewCount > 0 ? p.reviewCount : '0'}</MobileStat>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto @min-[761px]:block">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] tracking-wide text-text-muted uppercase">
              <th className="pb-2 pr-2 font-medium">Persona</th>
              <th className="pb-2 pr-2 font-medium">Tareas abiertas por prioridad</th>
              <th className="pb-2 pr-2 text-right font-medium">Vencidas</th>
              <th className="pb-2 pr-2 text-right font-medium">Vencen en 7 días</th>
              <th className="pb-2 pr-2 font-medium">Horas esta semana</th>
              <th className="pb-2 pr-2 text-right font-medium">Revisiones</th>
              <th className="pb-2 font-medium">Ausencia</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.userId} className="border-b border-border last:border-b-0">
                <td className="py-2.5 pr-2">
                  <span className="flex items-center gap-2.5">
                    <Avatar size="sm">
                      {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
                      <AvatarFallback className="text-[10px]">{initials(p.fullName)}</AvatarFallback>
                    </Avatar>
                    {p.fullName ?? 'Sin nombre'}
                  </span>
                </td>
                <td className="py-2.5 pr-2">
                  <LoadStack p={p} />
                </td>
                <td className="py-2.5 pr-2 text-right tabular-nums">
                  {p.overdueCount ? <span className="font-medium text-danger">{p.overdueCount}</span> : <span className="text-text-muted">0</span>}
                </td>
                <td className="py-2.5 pr-2 text-right tabular-nums">{p.dueSoonCount}</td>
                <td className="py-2.5 pr-2">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-alt">
                      <span className="block h-full rounded-full bg-text-secondary" style={{ width: `${Math.min(100, (p.hours / MAX_HOURS_BAR) * 100)}%` }} />
                    </span>
                    <span className="font-mono text-[12px]">{p.hours} h</span>
                  </span>
                </td>
                <td className="py-2.5 pr-2 text-right tabular-nums">
                  {p.reviewCount > 0 ? p.reviewCount : <span className="text-text-muted">0</span>}
                </td>
                <td className="py-2.5">
                  <AwayChip p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
