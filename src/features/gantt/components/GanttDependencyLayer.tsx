import { ROW_HEIGHT, dateToX, type TaskRange } from '@/features/gantt/gantt-layout'
import type { TaskDependency } from '@/features/tasks/dependencies/api'

interface GanttDependencyLayerProps {
  dependencies: TaskDependency[]
  scheduled: TaskRange[]
  chartStart: Date
  pxPerDay: number
  width: number
  tempConnector?: { fromTaskId: string; x: number; y: number } | null
  onRemove: (id: string) => void
}

function anchorX(range: TaskRange, chartStart: Date, pxPerDay: number, edge: 'start' | 'end') {
  if (range.task.is_milestone) return dateToX(range.start, chartStart, pxPerDay) + pxPerDay / 2
  return edge === 'end'
    ? dateToX(range.end, chartStart, pxPerDay) + pxPerDay
    : dateToX(range.start, chartStart, pxPerDay)
}

function rowY(index: number) {
  return index * ROW_HEIGHT + ROW_HEIGHT / 2
}

// Overlay SVG posicionado a partir del borde izquierdo del área de
// fechas (GanttChart le da `left: LEFT_COLUMN_WIDTH`) — sus coordenadas
// locales coinciden 1:1 con `dateToX`, sin offset extra acá.
export function GanttDependencyLayer({
  dependencies,
  scheduled,
  chartStart,
  pxPerDay,
  width,
  tempConnector,
  onRemove,
}: GanttDependencyLayerProps) {
  const height = scheduled.length * ROW_HEIGHT

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={width}
      height={height}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-accent" />
        </marker>
        <marker id="gantt-arrow-violated" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-danger" />
        </marker>
      </defs>

      {dependencies.map((dep) => {
        const predIndex = scheduled.findIndex((r) => r.task.id === dep.predecessor_id)
        const succIndex = scheduled.findIndex((r) => r.task.id === dep.successor_id)
        // Se comprueban las filas en vez de los índices: es la misma condición
        // (`findIndex` devuelve -1 justo cuando no hay fila) pero estrecha el
        // tipo, y evita tener que repetir la relación entre índice y elemento
        // en cuatro lugares más abajo.
        const pred = predIndex === -1 ? undefined : scheduled[predIndex]
        const succ = succIndex === -1 ? undefined : scheduled[succIndex]
        if (!pred || !succ) return null
        const x1 = anchorX(pred, chartStart, pxPerDay, 'end')
        const y1 = rowY(predIndex)
        const x2 = anchorX(succ, chartStart, pxPerDay, 'start')
        const y2 = rowY(succIndex)
        const violated = succ.start.getTime() < pred.end.getTime()
        const midX = (x1 + x2) / 2
        const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`

        return (
          <g key={dep.id} className="pointer-events-auto cursor-pointer" onClick={() => onRemove(dep.id)}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
            <path
              d={d}
              fill="none"
              className={violated ? 'stroke-danger' : 'stroke-accent'}
              strokeWidth={1.5}
              strokeDasharray={violated ? '4 3' : undefined}
              markerEnd={violated ? 'url(#gantt-arrow-violated)' : 'url(#gantt-arrow)'}
            />
          </g>
        )
      })}

      {tempConnector &&
        (() => {
          const fromIndex = scheduled.findIndex((r) => r.task.id === tempConnector.fromTaskId)
          const from = fromIndex === -1 ? undefined : scheduled[fromIndex]
          if (!from) return null
          const x1 = anchorX(from, chartStart, pxPerDay, 'end')
          const y1 = rowY(fromIndex)
          return (
            <line
              x1={x1}
              y1={y1}
              x2={tempConnector.x}
              y2={tempConnector.y}
              className="stroke-accent"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          )
        })()}
    </svg>
  )
}
