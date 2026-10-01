import type { ReportKpis as Kpis } from '@/features/reports/report-data'
import { cn } from '@/lib/utils'

function nf(n: number): string {
  return n.toLocaleString('es-CL')
}

function Delta({ value, goodWhenUp, unit }: { value: number; goodWhenUp: boolean; unit?: string }) {
  if (!value) return <span className="rounded-full bg-surface-alt px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">= 0</span>
  const up = value > 0
  const good = up === goodWhenUp
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 font-mono text-[11px] font-medium',
        good ? 'bg-success-bg text-success-text' : 'bg-danger-bg text-danger-text',
      )}
    >
      {up ? '▲' : '▼'} {nf(Math.abs(value))}
      {unit ?? ''}
    </span>
  )
}

/**
 * Los 6 indicadores del mockup. `ontimePct`/`cycleDays` no llevan delta:
 * get_report_data (0091) los calcula estables entre períodos a propósito
 * (no tiene sentido comparar un % contra el período anterior de la misma
 * forma que un conteo — ver el comentario de la migración).
 */
// Grid de 2/3/6 columnas según el ancho real (@min-, mismo contenedor que
// AppShell.tsx ya declara en <main>) — las líneas divisorias entre celdas
// se logran con `gap-px` + fondo del color del borde detrás, no con
// border-left/top por nth-child: esas reglas tendrían que recalcularse
// para cada cantidad de columnas (2/3/6) y quedarían frágiles. El truco
// del gap funciona igual sin importar cuántas columnas haya.
export function ReportKpis({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden border-y border-border bg-border @min-[621px]:grid-cols-3 @min-[981px]:grid-cols-6">
      <div className="flex flex-col gap-0.5 bg-surface p-3.5">
        <span className="text-xs text-text-muted">Abiertas</span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{nf(kpis.open)}</span>
        <Delta value={kpis.openDelta} goodWhenUp={false} />
      </div>
      <div className="flex flex-col gap-0.5 bg-surface p-3.5">
        <span className="text-xs text-text-muted">Completadas</span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{nf(kpis.done)}</span>
        <Delta value={kpis.doneDelta} goodWhenUp />
      </div>
      <div className="flex flex-col gap-0.5 bg-surface p-3.5">
        <span className="text-xs text-text-muted">Vencidas</span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums text-danger">{nf(kpis.overdue)}</span>
        <Delta value={kpis.overdueDelta} goodWhenUp={false} />
      </div>
      <div className="flex flex-col gap-0.5 bg-surface p-3.5">
        <span className="text-xs text-text-muted">A tiempo</span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {kpis.ontimePct}
          <small className="ml-0.5 text-sm font-medium text-text-secondary">%</small>
        </span>
        <span className="text-[11px] text-text-muted">cerradas antes de su vencimiento</span>
      </div>
      <div className="flex flex-col gap-0.5 bg-surface p-3.5">
        <span className="text-xs text-text-muted">Tiempo de ciclo, mediana</span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {kpis.cycleDays.toLocaleString('es-CL')}
          <small className="ml-0.5 text-sm font-medium text-text-secondary">días</small>
        </span>
        <span className="text-[11px] text-text-muted">de creada a cerrada</span>
      </div>
      <div className="flex flex-col gap-0.5 bg-surface p-3.5">
        <span className="text-xs text-text-muted">Horas registradas</span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {nf(kpis.hours)}
          <small className="ml-0.5 text-sm font-medium text-text-secondary">h</small>
        </span>
        <Delta value={kpis.hoursDelta} goodWhenUp unit=" h" />
      </div>
    </div>
  )
}
