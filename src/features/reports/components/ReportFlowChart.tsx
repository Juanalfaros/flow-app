import { useRef, useState } from 'react'
import { formatShortDate } from '@/lib/format-date'

interface WeekPoint {
  weekStart: string
  created: number
  completed: number
}

const HEIGHT = 220
const PAD_L = 30
const PAD_R = 90
const PAD_T = 12
const PAD_B = 26

/**
 * Creadas vs. completadas, últimas 12 semanas — SIEMPRE 12 semanas fijas,
 * sin importar el selector de período (mismo criterio que el mockup: los
 * `weeksCompleted`/`weeksCreated` de la demo no cambian con
 * semana/mes/trimestre, solo los KPIs de arriba lo hacen).
 */
export function ReportFlowChart({ weeks }: { weeks: WeekPoint[] }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const width = 640

  const max = Math.max(10, ...weeks.map((w) => Math.max(w.created, w.completed)))
  const pw = width - PAD_L - PAD_R
  const ph = HEIGHT - PAD_T - PAD_B
  const x = (i: number) => PAD_L + (i * pw) / Math.max(1, weeks.length - 1)
  const y = (v: number) => PAD_T + ph - (v / max) * ph

  // Sin useMemo: son 12 puntos, recalcularlos en cada render es más barato
  // que declarar x/y como dependencias estables (son closures nuevas cada
  // vez, así que "memoizar" acá no ahorraría nada real).
  const createdPath = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.created).toFixed(1)}`).join('')
  const completedPath = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.completed).toFixed(1)}`).join('')
  const completedArea = `${completedPath}L${x(weeks.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))
  const lastCreated = weeks[weeks.length - 1]?.created ?? 0
  const lastCompleted = weeks[weeks.length - 1]?.completed ?? 0
  const netBacklog = weeks.reduce((sum, w) => sum + (w.created - w.completed), 0)

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = ref.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const sx = ((e.clientX - rect.left) * width) / rect.width
    const i = Math.max(0, Math.min(weeks.length - 1, Math.round(((sx - PAD_L) * (weeks.length - 1)) / pw)))
    setHoverIndex(i)
  }

  const hovered = hoverIndex !== null ? weeks[hoverIndex] : null

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-text-muted" aria-hidden />
          Creadas <span className="tabular-nums text-text">{lastCreated}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-status-done" aria-hidden />
          Completadas <span className="tabular-nums text-text">{lastCompleted}</span>
        </span>
        <span className="text-text-muted">
          Backlog neto en 12 semanas: <b className="font-semibold text-text tabular-nums">{netBacklog > 0 ? '+' : ''}{netBacklog}</b>
        </span>
      </div>

      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block w-full font-mono text-[10.5px] text-text-muted"
          role="img"
          aria-label="Tareas creadas y completadas por semana"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {gridTicks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={PAD_L + pw} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--border)' : 'var(--surface-alt)'} strokeWidth={1} />
              <text x={PAD_L - 8} y={y(t) + 3.5} textAnchor="end" fill="currentColor">{t}</text>
            </g>
          ))}
          {weeks.map((w, i) => {
            if (weeks.length > 8 && i % 3 !== 0 && i !== weeks.length - 1) return null
            return (
              <text key={w.weekStart} x={x(i)} y={HEIGHT - 8} textAnchor="middle" fill="currentColor">
                {formatShortDate(w.weekStart)}
              </text>
            )
          })}
          <path d={completedArea} fill="var(--status-done)" fillOpacity={0.1} />
          <path d={createdPath} fill="none" stroke="var(--text-muted)" strokeWidth={2} strokeLinejoin="round" />
          <path d={completedPath} fill="none" stroke="var(--status-done)" strokeWidth={2} strokeLinejoin="round" />
          <circle cx={x(weeks.length - 1)} cy={y(lastCreated)} r={4} fill="var(--text-muted)" stroke="var(--surface)" strokeWidth={2} />
          <circle cx={x(weeks.length - 1)} cy={y(lastCompleted)} r={4} fill="var(--status-done)" stroke="var(--surface)" strokeWidth={2} />
          <text x={x(weeks.length - 1) + 10} y={y(lastCreated) + 4} className="text-[11.5px] font-sans font-medium" fill="var(--text-secondary)">
            Creadas {lastCreated}
          </text>
          <text x={x(weeks.length - 1) + 10} y={y(lastCompleted) + 4} className="text-[11.5px] font-sans font-medium" fill="var(--text-secondary)">
            Completadas {lastCompleted}
          </text>
          {hoverIndex !== null && (
            <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={PAD_T} y2={PAD_T + ph} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" />
          )}
        </svg>

        {hovered && hoverIndex !== null && (
          <div
            className="pointer-events-none absolute z-10 min-w-[150px] rounded-lg bg-text px-2.5 py-2 text-xs leading-relaxed text-bg shadow-lg"
            style={{
              left: `${(x(hoverIndex) / width) * 100}%`,
              top: 0,
              transform: hoverIndex > weeks.length / 2 ? 'translate(-105%, 0)' : 'translate(10px, 0)',
            }}
          >
            <p className="font-semibold">Semana del {formatShortDate(hovered.weekStart)}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span>Creadas</span>
              <span className="tabular-nums">{hovered.created}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Completadas</span>
              <span className="tabular-nums">{hovered.completed}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Neto</span>
              <span className="tabular-nums">{hovered.created - hovered.completed > 0 ? '+' : ''}{hovered.created - hovered.completed}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
