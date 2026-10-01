import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { formatShortDate, formatRelativeTime } from '@/lib/format-date'
import type { ReportAttention as Attention } from '@/features/reports/report-data'
import { STAGE_LABEL } from '@/features/reports/report-colors'
import { cn } from '@/lib/utils'

interface Group {
  key: string
  n: number
  sev: 'bad' | 'warn' | 'flat'
  title: string
  defaultOpen?: boolean
  items: { key: string; title: string; meta: string; right: string; rightTone?: 'bad' | 'warn' }[]
}

function buildGroups(a: Attention): Group[] {
  return [
    {
      key: 'overdue7',
      n: a.overdue7.length,
      sev: 'bad',
      title: 'Vencidas hace más de 7 días',
      defaultOpen: true,
      items: a.overdue7.map((it) => ({
        key: it.id,
        title: it.title,
        meta: [it.spaceTitle, it.projectTitle, it.assignees].filter(Boolean).join(' · '),
        right: formatRelativeTime(it.dueDate),
        rightTone: 'bad',
      })),
    },
    {
      key: 'away',
      n: a.away.length,
      sev: 'warn',
      title: 'Vencen mientras su responsable está ausente',
      defaultOpen: true,
      items: a.away.map((it) => ({
        key: it.id,
        title: it.title,
        meta: [it.spaceTitle, it.projectTitle].filter(Boolean).join(' · ') + ` · vence ${formatShortDate(it.dueDate)}`,
        right: `${it.assigneeName}, ausente hasta ${formatShortDate(it.endsOn)}`,
        rightTone: 'warn',
      })),
    },
    {
      key: 'blocked',
      n: a.blocked.length,
      sev: 'warn',
      title: 'Bloqueadas por una dependencia',
      items: a.blocked.map((it) => ({
        key: it.id,
        title: it.title,
        meta: `espera "${it.predTitle}" · ${STAGE_LABEL[it.predStatusKind]?.toLowerCase() ?? it.predStatusKind}`,
        right: it.projectTitle ?? '',
      })),
    },
    {
      key: 'reviews',
      n: a.reviews.length,
      sev: 'flat',
      title: 'Revisiones esperando hace más de 3 días',
      items: a.reviews.map((it) => ({
        key: it.id,
        title: it.title,
        meta: `revisa ${it.reviewerName}`,
        right: formatRelativeTime(it.reviewSince),
      })),
    },
    {
      key: 'unassigned',
      n: a.unassigned.length,
      sev: 'flat',
      title: 'Abiertas sin responsable',
      items: a.unassigned.map((it) => ({
        key: it.id,
        title: it.title,
        meta: [it.spaceTitle, it.projectTitle].filter(Boolean).join(' · '),
        right: it.dueDate ? `vence ${formatShortDate(it.dueDate)}` : 'sin fecha',
      })),
    },
  ]
}

const SEV_CLASS: Record<Group['sev'], string> = {
  bad: 'bg-danger-bg text-danger-text',
  warn: 'bg-warn-bg text-warn-text',
  flat: 'bg-surface-alt text-text-secondary',
}

export function ReportAttention({ attention }: { attention: Attention }) {
  const groups = buildGroups(attention).filter((g) => g.n > 0)

  if (groups.length === 0) {
    return <p className="py-6 text-center text-sm text-text-muted">Nada necesita atención ahora mismo.</p>
  }

  return (
    <div className="flex flex-col">
      {groups.map((g) => (
        <AttentionGroup key={g.key} group={g} />
      ))}
    </div>
  )
}

function AttentionGroup({ group }: { group: Group }) {
  const [open, setOpen] = useState(!!group.defaultOpen)
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md px-1 py-2.5 text-left hover:bg-surface-alt"
      >
        <span className={cn('grid h-[22px] min-w-[26px] place-items-center rounded-md px-1.5 font-mono text-xs font-medium', SEV_CLASS[group.sev])}>
          {group.n}
        </span>
        <span className="flex-1 text-sm">{group.title}</span>
        <HugeiconsIcon icon={ArrowRight01Icon} className={cn('size-3.5 shrink-0 text-text-muted transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 py-1 pr-1 pb-2.5 pl-10">
          {group.items.map((it) => (
            <div key={it.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-0.5 text-[12.5px]">
              <span className="truncate font-medium text-text">{it.title}</span>
              <span
                className={cn(
                  'row-span-2 self-center justify-self-end font-mono text-[11.5px] whitespace-nowrap',
                  it.rightTone === 'bad' ? 'text-danger' : it.rightTone === 'warn' ? 'text-warn' : 'text-text-secondary',
                )}
              >
                {it.right}
              </span>
              <span className="truncate text-xs text-text-muted">{it.meta}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
