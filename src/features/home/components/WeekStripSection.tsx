import { useMemo } from 'react'
import { isBefore, isToday, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { format as formatDate } from 'date-fns'
import { getWeekDays, toDateKey } from '@/features/calendar/date-utils'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { isClosedStatus, isDoneStatus } from '@/features/projects/status-kind'
import { PRIORITY_DOT, PRIORITY_LABEL } from '@/features/tasks/priority'
import { useTimeOff, isAwayOn, TIME_OFF_KIND_LABEL } from '@/features/people/time-off'
import { useWeekMilestones, type FocusTaskRow } from '@/features/home/queries'
import { cn } from '@/lib/utils'

interface DayInfo {
  date: Date
  key: string
  isToday: boolean
  isPast: boolean
  dots: { color: string; title: string }[]
  label: string | null
  milestone: { id: string; title: string } | null
  away: string | null
}

interface WeekStripSectionProps {
  workspaceId: string
  userId: string | undefined
  openTasks: FocusTaskRow[]
}

// "Esta semana" (mockup https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy):
// tira de 7 días con lo que ya se tiene en caché de la propia página (mis
// tareas por vencimiento) más dos queries chicas nuevas — hitos del
// workspace en el rango de la semana, y mis propias ausencias (ya cacheadas
// en `timeOffQueryOptions` si se visitó Equipo antes). Días PASADOS
// resumen qué pasó (cuántas se hicieron, cuántas quedaron vencidas); hoy y
// los que faltan muestran la prioridad de lo que sigue abierto — mismo
// criterio que separa "se hizo a tiempo" de "sigue atrasada" en
// delivery-state.ts, aplicado acá por día en vez de por tarea.
export function WeekStripSection({ workspaceId, userId, openTasks }: WeekStripSectionProps) {
  const setNode = useSetNodeSearchParam()
  const weekDays = useMemo(() => getWeekDays(new Date()), [])
  const startKey = toDateKey(weekDays[0])
  const endKey = toDateKey(weekDays[6])

  const { data: milestones } = useWeekMilestones(workspaceId, startKey, endKey)
  const { data: timeOff } = useTimeOff(workspaceId)
  const myTimeOff = useMemo(() => (timeOff ?? []).filter((t) => t.user_id === userId), [timeOff, userId])

  const days = useMemo<DayInfo[]>(() => {
    return weekDays.map((date) => {
      const key = toDateKey(date)
      const past = isBefore(date, startOfDay(new Date())) && !isToday(date)
      const tasksThatDay = openTasks.filter((t) => t.due_date === key)
      const doneThatDay = tasksThatDay.filter((t) => isDoneStatus(t.status?.status_kind))
      const openThatDay = tasksThatDay.filter((t) => !isClosedStatus(t.status?.status_kind))

      let dots: DayInfo['dots'] = []
      let label: string | null = null

      if (past) {
        if (openThatDay.length > 0) {
          dots = openThatDay.map(() => ({ color: 'bg-danger', title: 'Quedó vencida' }))
          label = `${openThatDay.length} ${openThatDay.length === 1 ? 'quedó' : 'quedaron'} vencida${openThatDay.length === 1 ? '' : 's'}`
        } else if (doneThatDay.length > 0) {
          dots = doneThatDay.map(() => ({ color: 'bg-success', title: 'Hecha' }))
          label = `${doneThatDay.length} hecha${doneThatDay.length === 1 ? '' : 's'}`
        }
      } else {
        dots = openThatDay.map((t) => ({
          color: PRIORITY_DOT[t.priority] ?? 'bg-text-muted',
          title: `Prioridad ${PRIORITY_LABEL[t.priority] ?? t.priority}`,
        }))
        if (openThatDay.length > 0) {
          label = isToday(date)
            ? `${openThatDay.length} vence${openThatDay.length === 1 ? '' : 'n'} hoy`
            : `${openThatDay.length} tarea${openThatDay.length === 1 ? '' : 's'}`
        }
      }

      const milestone = (milestones ?? []).find((m) => m.due_date === key)
      const away = isAwayOn(myTimeOff, date)

      return {
        date,
        key,
        isToday: isToday(date),
        isPast: past,
        dots,
        label,
        milestone: milestone ? { id: milestone.id, title: milestone.title } : null,
        away: away ? (TIME_OFF_KIND_LABEL[away.kind] ?? 'Ausente') : null,
      }
    })
  }, [weekDays, openTasks, milestones, myTimeOff])

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Esta semana</h2>
        <span className="text-xs text-text-muted">tus vencimientos, hitos y ausencias</span>
      </div>

      {/* Angosto: fila con scroll horizontal y columnas de ancho fijo (64px,
          mismo número que el mockup) — un `grid-cols-7` que se va achicando
          apretaba "Lun21" hasta que el día y el número se tocaban. Desde
          620px (mismo corte que el mockup) pasa a grid de 7 columnas
          parejas, sin scroll. */}
      <div className="flex gap-1.5 overflow-x-auto @min-[620px]:grid @min-[620px]:grid-cols-7 @min-[620px]:overflow-visible">
        {days.map((d) => (
          <div
            key={d.key}
            className={cn(
              'flex min-h-24 w-16 shrink-0 flex-col gap-1.5 rounded-[10px] bg-surface-alt/60 p-2.5 @min-[620px]:w-auto',
              d.isToday && 'bg-accent-soft ring-[1.5px] ring-inset ring-accent',
              d.isPast && 'opacity-60',
            )}
          >
            <div className="flex items-baseline justify-between">
              <span className={cn('text-xs text-text-muted capitalize', d.isToday && 'text-accent-text-on-bg')}>
                {formatDate(d.date, 'EEE', { locale: es })}
              </span>
              <span className={cn('text-[17px] font-semibold tabular-nums', d.isToday && 'text-accent-text-on-bg')}>
                {formatDate(d.date, 'd')}
              </span>
            </div>

            {d.dots.length > 0 && (
              <div className="flex flex-wrap gap-[3px]">
                {d.dots.map((dot, i) => (
                  <span key={i} className={cn('block size-2 rounded-[2px]', dot.color)} title={dot.title} />
                ))}
              </div>
            )}

            {d.label && <span className="text-[11px] leading-tight text-text-secondary">{d.label}</span>}
            {d.milestone && (
              <button
                type="button"
                onClick={() => setNode(d.milestone!.id)}
                className="truncate text-left text-[11px] leading-tight font-medium text-accent-text-on-bg hover:underline"
              >
                Hito: {d.milestone.title}
              </button>
            )}
            {d.away && <span className="text-[11px] leading-tight text-warn-text">{d.away}</span>}
          </div>
        ))}
      </div>
    </section>
  )
}
