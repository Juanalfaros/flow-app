import { useRef, useState } from 'react'
import { formatShortDate } from '@/lib/format-date'
import type { HoursBySpace } from '@/features/reports/report-data'
import { spaceColor } from '@/features/reports/report-colors'

const HEIGHT = 220
const PAD_L = 34
const PAD_R = 6
const PAD_T = 14
const PAD_B = 26

export function ReportHoursChart({ series, weekStarts }: { series: HoursBySpace[]; weekStarts: string[] }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const width = 640
  const n = weekStarts.length

  const totals = weekStarts.map((_, i) => series.reduce((sum, s) => sum + (s.weekly[i] ?? 0), 0))
  const max = Math.max(10, ...totals)
  const pw = width - PAD_L - PAD_R
  const ph = HEIGHT - PAD_T - PAD_B
  const slot = pw / n
  const barW = slot * 0.56
  const y = (v: number) => PAD_T + ph - (v / max) * ph

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = ref.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const sx = ((e.clientX - rect.left) * width) / rect.width
    const i = Math.max(0, Math.min(n - 1, Math.floor((sx - PAD_L) / slot)))
    setHoverIndex(i)
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        {series.map((s, i) => (
          <span key={s.spaceId} className="flex items-center gap-1.5">
            <i className="inline-block size-2 rounded-full" style={{ background: spaceColor(i) }} aria-hidden />
            {s.spaceTitle}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block w-full font-mono text-[10.5px] text-text-muted"
          role="img"
          aria-label="Horas registradas por semana, apiladas por espacio"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {gridTicks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={PAD_L + pw} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--border)' : 'var(--surface-alt)'} strokeWidth={1} />
              <text x={PAD_L - 7} y={y(t) + 3.5} textAnchor="end" fill="currentColor">{t}</text>
            </g>
          ))}
          {weekStarts.map((w, i) => {
            const cx = PAD_L + slot * i + slot / 2
            let acc = 0
            return (
              <g key={w}>
                {series.map((s, k) => {
                  const v = s.weekly[i] ?? 0
                  const y1 = y(acc + v)
                  const h = Math.max(0, y(acc) - y1)
                  acc += v
                  if (v === 0) return null
                  const isLast = k === series.length - 1
                  return isLast ? (
                    <rect key={s.spaceId} x={cx - barW / 2} y={y1} width={barW} height={h} rx={3} fill={spaceColor(k)} />
                  ) : (
                    <rect key={s.spaceId} x={cx - barW / 2} y={y1} width={barW} height={h} fill={spaceColor(k)} />
                  )
                })}
                {i === n - 1 && totals[i]! > 0 && (
                  <text x={cx} y={y(totals[i]!) - 6} textAnchor="middle" fill="var(--text-secondary)" className="font-sans font-medium" style={{ fontSize: 11.5 }}>
                    {totals[i]} h
                  </text>
                )}
                <text x={cx} y={HEIGHT - 8} textAnchor="middle" fill="currentColor">{formatShortDate(w)}</text>
                <rect x={PAD_L + slot * i} y={PAD_T} width={slot} height={ph} fill="transparent" />
              </g>
            )
          })}
        </svg>

        {hoverIndex !== null && totals[hoverIndex]! > 0 && (
          <div
            className="pointer-events-none absolute z-10 min-w-[150px] rounded-lg bg-text px-2.5 py-2 text-xs leading-relaxed text-bg shadow-lg"
            style={{
              left: `${((PAD_L + slot * hoverIndex + slot / 2) / width) * 100}%`,
              top: 0,
              transform: hoverIndex > n / 2 ? 'translate(-105%, 0)' : 'translate(10px, 0)',
            }}
          >
            <p className="font-semibold">
              Semana del {formatShortDate(weekStarts[hoverIndex]!)} · {totals[hoverIndex]} h
            </p>
            {[...series].reverse().map((s, i) => {
              const v = s.weekly[hoverIndex] ?? 0
              if (v === 0) return null
              return (
                <div key={s.spaceId} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <i className="inline-block size-2 rounded-sm" style={{ background: spaceColor(series.length - 1 - i) }} />
                    {s.spaceTitle}
                  </span>
                  <span className="tabular-nums">{v} h</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
