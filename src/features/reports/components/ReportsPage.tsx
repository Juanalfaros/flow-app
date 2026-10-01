import { useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { Skeleton } from '@/components/ui/skeleton'
import { useReportData, DEFAULT_REPORT_FILTERS, type ReportFilters as Filters } from '@/features/reports/report-data'
import { ReportFilters } from '@/features/reports/components/ReportFilters'
import { ReportKpis } from '@/features/reports/components/ReportKpis'
import { ReportAttention } from '@/features/reports/components/ReportAttention'
import { ReportFlowChart } from '@/features/reports/components/ReportFlowChart'
import { ReportPortfolio } from '@/features/reports/components/ReportPortfolio'
import { ReportMilestones } from '@/features/reports/components/ReportMilestones'
import { ReportHoursChart } from '@/features/reports/components/ReportHoursChart'
import { ReportPeople } from '@/features/reports/components/ReportPeople'
import { ReportDistributions } from '@/features/reports/components/ReportDistributions'
import { downloadPortfolioCsv } from '@/features/reports/export-csv'

interface ReportsPageProps {
  workspaceId: string
}

// Rediseño de /reportes (mockup: https://claude.ai/artifact/UtZT4mb5RAYrGzuYCqbNLU)
// — reemplaza los tres SectionCard de siempre (completadas por semana,
// vencidas por lista, carga por persona) por un solo llamado a
// get_report_data (0091) que trae todo lo que la maqueta pide: KPIs,
// atención, portafolio, hitos, horas, personas y distribuciones.
export function ReportsPage({ workspaceId }: ReportsPageProps) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_REPORT_FILTERS)
  const { data, isPending } = useReportData(workspaceId, filters)

  return (
    <PageShell width="app" className="gap-6">
      <ReportFilters
        workspaceId={workspaceId}
        filters={filters}
        onChange={setFilters}
        onExportCsv={() => data && downloadPortfolioCsv(data.portfolio, data.spaces)}
      />

      {isPending || !data ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <ReportKpis kpis={data.kpis} />

          <div className="grid grid-cols-1 gap-8 @min-[981px]:grid-cols-[5fr_1px_6fr]">
            <Section title="Necesita atención" subtitle="hoy">
              <ReportAttention attention={data.attention} />
            </Section>
            <div className="hidden bg-border @min-[981px]:block" aria-hidden />
            <Section title="Creadas y completadas" subtitle="tareas por semana · 12 semanas">
              <ReportFlowChart weeks={data.flow} />
            </Section>
          </div>

          <Section title="Portafolio por espacio" subtitle="toca un espacio para ver sus listas">
            <ReportPortfolio portfolio={data.portfolio} spaces={data.spaces} />
          </Section>

          <div className="grid grid-cols-1 gap-8 @min-[981px]:grid-cols-2">
            <Section title="Hitos" subtitle="próximos 30 días y vencidos">
              <ReportMilestones milestones={data.milestones} />
            </Section>
            <Section title="Horas registradas por espacio" subtitle="8 semanas">
              <ReportHoursChart series={data.hoursBySpace} weekStarts={weekStartsFromFlow(data.flow)} />
            </Section>
          </div>

          <Section title="Personas" subtitle={`${data.people.length} con tareas abiertas · ordenadas por vencidas`}>
            <ReportPeople people={data.people} />
          </Section>

          <ReportDistributions distributions={data.distributions} spaceSelected={!!filters.spaceId} />
        </>
      )}
    </PageShell>
  )
}

function weekStartsFromFlow(flow: { weekStart: string }[]): string[] {
  return flow.slice(-8).map((w) => w.weekStart)
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
      </div>
      {children}
    </section>
  )
}
