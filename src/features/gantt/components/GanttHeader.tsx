import { eachDayOfInterval, format, isWeekend } from 'date-fns'
import { es } from 'date-fns/locale'
import { HEADER_HEIGHT } from '@/features/gantt/gantt-layout'
import { useGanttLeftColumnWidth } from '@/features/gantt/use-gantt-left-column-width'
import { cn } from '@/lib/utils'

interface GanttHeaderProps {
  range: { start: Date; end: Date }
  pxPerDay: number
}

// Umbral a ojo: por debajo de esto el número de día y la inicial del
// nombre se superponen y quedan ilegibles — a partir de acá el zoom
// "Semana"/"Mes" solo sirve para ver el panorama (dónde caen las barras),
// no el detalle por día.
const MIN_PX_FOR_LABELS = 18

export function GanttHeader({ range, pxPerDay }: GanttHeaderProps) {
  const days = eachDayOfInterval(range)
  const leftColumnWidth = useGanttLeftColumnWidth()
  const showLabels = pxPerDay >= MIN_PX_FOR_LABELS

  return (
    <div className="sticky top-0 z-20 flex border-b border-border bg-surface" style={{ height: HEADER_HEIGHT }}>
      <div
        className="sticky left-0 z-30 shrink-0 border-r border-border/60 bg-surface"
        style={{ width: leftColumnWidth }}
      />
      {days.map((day) => (
        <div
          key={day.toISOString()}
          className={cn(
            'flex shrink-0 flex-col items-center justify-center border-r border-border/30 text-[10px] text-text-muted',
            isWeekend(day) && 'bg-surface-alt/50',
          )}
          style={{ width: pxPerDay }}
        >
          {showLabels && (
            <>
              <span>{format(day, 'd')}</span>
              <span className="text-[9px] uppercase">{format(day, 'EEEEE', { locale: es })}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
