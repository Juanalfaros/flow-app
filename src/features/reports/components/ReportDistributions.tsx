import type { ReportDistributions as Distributions } from '@/features/reports/report-data'
import { PRIORITY_LABEL, PRIORITIES } from '@/features/tasks/priority'

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--danger)',
  high: 'var(--accent-2)',
  medium: 'var(--accent)',
  low: 'var(--text-muted)',
}

function Bars({ rows }: { rows: { label: string; n: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[110px_minmax(0,1fr)_30px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-text-secondary">{r.label}</span>
          <span className="h-2 rounded-r-sm" style={{ width: `${(r.n / max) * 100}%`, background: r.color }} />
          <span className="text-right font-mono text-[12px]">{r.n}</span>
        </div>
      ))}
    </div>
  )
}

export function ReportDistributions({ distributions, spaceSelected }: { distributions: Distributions; spaceSelected: boolean }) {
  const total = Object.values(distributions.priority).reduce((a, b) => a + b, 0) + 0
  const priorityRows = PRIORITIES.slice()
    .reverse()
    .map((pr) => ({ label: PRIORITY_LABEL[pr]!, n: distributions.priority[pr] ?? 0, color: PRIORITY_COLOR[pr]! }))
    .filter((r) => r.n > 0)

  const labelRows = distributions.label.map((l) => ({ label: l.name, n: l.n, color: 'var(--text-secondary)' }))

  const fieldRows = distributions.field.map((f) => ({ label: f.label, n: f.n, color: 'var(--tag-azul)' }))

  return (
    <div>
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Cómo se reparten las {total} abiertas</h2>
      <div className="grid grid-cols-1 gap-6 @min-[981px]:grid-cols-3">
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-semibold">Por prioridad</h3>
          {priorityRows.length === 0 ? <p className="text-xs text-text-muted">Sin tareas abiertas.</p> : <Bars rows={priorityRows} />}
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4 @min-[981px]:border-t-0 @min-[981px]:border-l @min-[981px]:pt-0 @min-[981px]:pl-6">
          <h3 className="text-[13px] font-semibold">Por etiqueta</h3>
          {labelRows.length === 0 ? <p className="text-xs text-text-muted">Sin etiquetas en las abiertas.</p> : <Bars rows={labelRows} />}
          {distributions.labelNone > 0 && <p className="text-[11.5px] text-text-muted">{distributions.labelNone} sin etiqueta</p>}
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4 @min-[981px]:border-t-0 @min-[981px]:border-l @min-[981px]:pt-0 @min-[981px]:pl-6">
          <h3 className="text-[13px] font-semibold">
            Por campo {distributions.fieldName && <span className="font-normal text-text-muted">· {distributions.fieldName}</span>}
          </h3>
          {!spaceSelected ? (
            <p className="text-xs text-text-muted">Elegí un espacio para ver esta distribución — los campos son por lista, sin un espacio no hay un nombre en común.</p>
          ) : !distributions.fieldName ? (
            <p className="text-xs text-text-muted">Este espacio no tiene un campo de opción única.</p>
          ) : fieldRows.length === 0 ? (
            <p className="text-xs text-text-muted">Sin tareas abiertas con este campo.</p>
          ) : (
            <Bars rows={fieldRows} />
          )}
          <p className="text-[11.5px] text-text-muted">Cualquier campo de opción única de un espacio</p>
        </div>
      </div>
    </div>
  )
}
