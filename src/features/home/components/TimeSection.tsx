import { useMemo, useState } from 'react'
import { format as formatDate, getDay, isWeekend } from 'date-fns'
import { HugeiconsIcon } from '@hugeicons/react'
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { getWeekDays, toDateKey } from '@/features/calendar/date-utils'
import { useWeekTimeEntries } from '@/features/home/queries'
import { QuickTimeEntryDialog } from '@/features/home/components/QuickTimeEntryDialog'
import { cn } from '@/lib/utils'

const MAX_BAR_HEIGHT_PX = 60
const FULL_DAY_MINUTES = 8 * 60
// `date-fns` (locale es) da "M" para martes Y miércoles en formato
// angosto ('EEEEE') — sin distinción, a diferencia de la convención
// chilena L-M-X-J-V-S-D que sí separa miércoles con X. Fijo por día ISO
// (0=domingo) en vez de confiar en el locale acá.
const WEEKDAY_LETTER: Record<number, string> = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' }

function formatHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0 && m === 0) return '0 min'
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

interface TimeSectionProps {
  workspaceId: string
  userId: string | undefined
}

// "Tu tiempo" (mockup https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy):
// horas registradas hoy y en la semana, con la misma barra de 5 días
// (lun-vie, sin fin de semana) del mockup. "Registrar tiempo" abre el
// mismo diálogo que ya construyó la PR 1 para la cabecera — un solo lugar
// que sabe crear un registro de tiempo sin tarea pre-elegida.
export function TimeSection({ workspaceId, userId }: TimeSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const weekDays = useMemo(() => getWeekDays(new Date()), [])
  const todayKey = toDateKey(new Date())
  const { data: entries } = useWeekTimeEntries(userId, toDateKey(weekDays[0]), toDateKey(weekDays[6]))

  const { todayMinutes, weekMinutes, byDay, lastEntry } = useMemo(() => {
    const rows = entries ?? []
    const perDay = new Map<string, number>()
    let today = 0
    let week = 0
    for (const e of rows) {
      week += e.minutes
      if (e.entry_date === todayKey) today += e.minutes
      perDay.set(e.entry_date, (perDay.get(e.entry_date) ?? 0) + e.minutes)
    }
    return { todayMinutes: today, weekMinutes: week, byDay: perDay, lastEntry: rows[0] ?? null }
  }, [entries, todayKey])

  const weekdays = weekDays.filter((d) => !isWeekend(d))

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-[15px] font-semibold tracking-tight">Tu tiempo</h2>

      <div className="flex flex-col gap-1">
        <span className="text-[26px] leading-none font-semibold tracking-tight tabular-nums">{formatHM(todayMinutes)}</span>
        <span className="text-[13px] text-text-muted">hoy · {formatHM(weekMinutes)} esta semana</span>
      </div>

      <div className="grid h-[84px] grid-cols-5 items-end gap-2" aria-label="Horas por día de esta semana">
        {weekdays.map((day) => {
          const key = toDateKey(day)
          const minutes = byDay.get(key) ?? 0
          const isToday = key === todayKey
          const heightPx = Math.min((minutes / FULL_DAY_MINUTES) * MAX_BAR_HEIGHT_PX, MAX_BAR_HEIGHT_PX)
          return (
            <div key={key} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="font-mono text-[10.5px] text-text-secondary">
                {minutes > 0 ? (minutes / 60).toFixed(1).replace('.', ',') : ''}
              </span>
              <span
                className={cn('block w-full max-w-[30px] rounded-t', isToday ? 'bg-accent' : 'bg-text-secondary/35')}
                style={{ height: Math.max(heightPx, minutes > 0 ? 3 : 0) }}
              />
              <span className="font-mono text-[10.5px] text-text-muted">{WEEKDAY_LETTER[getDay(day)]}</span>
            </div>
          )
        })}
      </div>

      {lastEntry && (
        <span className="text-xs text-text-muted">
          Último registro: {lastEntry.node?.title ?? 'Tarea'} · {formatHM(lastEntry.minutes)}, a las{' '}
          {formatDate(new Date(lastEntry.created_at), 'HH:mm')}
        </span>
      )}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <HugeiconsIcon icon={Clock01Icon} />
          Registrar tiempo
        </Button>
      </div>

      <QuickTimeEntryDialog workspaceId={workspaceId} userId={userId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  )
}
