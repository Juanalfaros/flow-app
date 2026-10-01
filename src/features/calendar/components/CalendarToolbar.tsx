import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { formatRangeTitle, shiftAnchorDate, type CalendarRange } from '@/features/calendar/date-utils'
import { cn } from '@/lib/utils'

const RANGE_LABEL: Record<CalendarRange, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
}

interface CalendarToolbarProps {
  range: CalendarRange
  anchorDate: Date
  onRangeChange: (range: CalendarRange) => void
  onAnchorChange: (date: Date) => void
}

export function CalendarToolbar({ range, anchorDate, onRangeChange, onAnchorChange }: CalendarToolbarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => onAnchorChange(shiftAnchorDate(anchorDate, range, -1))}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAnchorChange(new Date())}>
            Hoy
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onAnchorChange(shiftAnchorDate(anchorDate, range, 1))}>
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
        </div>
        <h2 className="text-sm font-medium text-text">{formatRangeTitle(anchorDate, range)}</h2>
      </div>

      <nav className="flex gap-0.5 rounded-md bg-surface-alt p-0.5 text-sm">
        {(['day', 'week', 'month'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRangeChange(r)}
            className={cn(
              'rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1 text-text-muted transition-colors hover:text-text',
              range === r && 'bg-bg text-text shadow-sm',
            )}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </nav>
    </div>
  )
}
