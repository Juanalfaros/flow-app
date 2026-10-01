import { createFileRoute, redirect } from '@tanstack/react-router'
import { membershipsQueryOptions, useCurrentWorkspace } from '@/features/workspace/queries'
import { archivedNodesQueryOptions } from '@/features/nodes/queries'
import { ArchivedNodesPage } from '@/features/nodes/components/ArchivedNodesPage'

export const Route = createFileRoute('/_app/archivados')({
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    const membership = memberships[0]
    if (!membership) throw redirect({ to: '/onboarding' })

    await context.queryClient.ensureQueryData(archivedNodesQueryOptions(membership.workspace_id))
  },
  component: ArchivadosRoute,
})

function ArchivadosRoute() {
  const { workspaceId } = useCurrentWorkspace()
  if (!workspaceId) return null
  return <ArchivedNodesPage workspaceId={workspaceId} />
}
