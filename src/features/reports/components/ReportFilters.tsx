import { HugeiconsIcon } from '@hugeicons/react'
import { BookmarkAdd01Icon, Download04Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSpaces } from '@/features/workspace/queries'
import { useTeams } from '@/features/teams/queries'
import { usePeople } from '@/features/people/queries'
import type { ReportFilters as Filters, ReportPeriod } from '@/features/reports/report-data'
import { cn } from '@/lib/utils'

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'trimestre', label: 'Trimestre' },
]

const ALL = '__all__'

interface ReportFiltersProps {
  workspaceId: string
  filters: Filters
  onChange: (filters: Filters) => void
  onExportCsv: () => void
}

export function ReportFilters({ workspaceId, filters, onChange, onExportCsv }: ReportFiltersProps) {
  const { data: spaces } = useSpaces(workspaceId)
  const { data: teams } = useTeams(workspaceId)
  const { data: people } = usePeople(workspaceId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-nowrap items-start gap-4">
        <h1 className="text-lg font-medium">Reportes</h1>
        {/* "Guardar vista" es solo visual por ahora — el mockup tampoco la
            conecta a nada: no hay un lugar donde persistirla todavía
            (tabla nueva fuera del alcance de este rediseño, decisión
            explícita del usuario). En mobile las dos acciones se van al
            menú ⋯, como pide el mockup — no entran cómodas como botones
            de texto al lado del título en una pantalla angosta. */}
        <div className="ml-auto hidden gap-2 @min-[621px]:flex">
          <Button variant="outline" size="sm" disabled title="Próximamente">
            <HugeiconsIcon icon={BookmarkAdd01Icon} />
            Guardar vista
          </Button>
          <Button variant="outline" size="sm" onClick={onExportCsv}>
            <HugeiconsIcon icon={Download04Icon} />
            Exportar CSV
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" className="ml-auto @min-[621px]:hidden" aria-label="Más acciones: guardar vista, exportar CSV">
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              <HugeiconsIcon icon={BookmarkAdd01Icon} />
              Guardar vista (próximamente)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportCsv}>
              <HugeiconsIcon icon={Download04Icon} />
              Exportar CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* El período ocupa toda la fila arriba; espacio/equipo/persona/
          subtareas se deslizan de lado debajo — mismo criterio que el
          mockup ("Filtros en una sola fila deslizable") en vez de que los
          selects se apilen en varias filas cortando la lectura. */}
      <div className="flex flex-col gap-2 @min-[621px]:flex-row @min-[621px]:flex-wrap @min-[621px]:items-center">
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-alt p-0.5 @min-[621px]:flex-none">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange({ ...filters, period: p.value })}
              aria-pressed={filters.period === p.value}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors @min-[621px]:flex-none',
                filters.period === p.value ? 'bg-surface text-text shadow-sm' : 'text-text-secondary hover:text-text',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 @min-[621px]:mx-0 @min-[621px]:flex-wrap @min-[621px]:overflow-visible @min-[621px]:px-0">
          <Select
            value={filters.spaceId ?? ALL}
            onValueChange={(v) => onChange({ ...filters, spaceId: v === ALL ? null : v })}
          >
            <SelectTrigger size="sm" className="shrink-0" aria-label="Filtrar por espacio">
              <span className="text-text-muted">Espacio</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {(spaces ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.teamId ?? ALL}
            onValueChange={(v) => onChange({ ...filters, teamId: v === ALL ? null : v })}
          >
            <SelectTrigger size="sm" className="shrink-0" aria-label="Filtrar por equipo">
              <span className="text-text-muted">Equipo</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {(teams ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.userId ?? ALL}
            onValueChange={(v) => onChange({ ...filters, userId: v === ALL ? null : v })}
          >
            <SelectTrigger size="sm" className="shrink-0" aria-label="Filtrar por persona">
              <span className="text-text-muted">Persona</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {(people ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary">
            <Checkbox
              checked={filters.includeSubtasks}
              onCheckedChange={(v) => onChange({ ...filters, includeSubtasks: v === true })}
            />
            Subtareas
          </label>
        </div>
      </div>
    </div>
  )
}
