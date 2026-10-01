import { createFileRoute, redirect } from '@tanstack/react-router'
import { membershipsQueryOptions, useCurrentWorkspace } from '@/features/workspace/queries'
import { reportDataQueryOptions, DEFAULT_REPORT_FILTERS } from '@/features/reports/report-data'
import { ReportsPage } from '@/features/reports/components/ReportsPage'

export const Route = createFileRoute('/_app/reportes')({
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    const membership = memberships[0]
    if (!membership) throw redirect({ to: '/onboarding' })

    const workspaceId = membership.workspace_id
    // Solo el filtro por default (semana, sin espacio/equipo/persona): el
    // resto de las combinaciones se piden recién cuando alguien las elige
    // — precalentar las 4 dimensiones de filtro de una sería, en el mejor
    // de los casos, trabajo que nadie usa.
    await context.queryClient.ensureQueryData(reportDataQueryOptions(workspaceId, DEFAULT_REPORT_FILTERS))
  },
  component: ReportsRoute,
})

function ReportsRoute() {
  const { workspaceId } = useCurrentWorkspace()
  if (!workspaceId) return null
  return <ReportsPage workspaceId={workspaceId} />
}
