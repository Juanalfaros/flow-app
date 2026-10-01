import { createFileRoute, redirect } from '@tanstack/react-router'
import { membershipsQueryOptions, useCurrentWorkspace } from '@/features/workspace/queries'
import { taskTemplatesQueryOptions, projectTemplatesQueryOptions } from '@/features/templates/queries'
import { TemplatesPage } from '@/features/templates/components/TemplatesPage'
import { SimpleListPageSkeleton } from '@/components/layout/PageSkeletons'

export const Route = createFileRoute('/_app/plantillas')({
  // Ver el comentario equivalente en routes/_app/index.tsx. Auditoría de
  // skeletons.
  pendingComponent: SimpleListPageSkeleton,
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    const membership = memberships[0]
    if (!membership) throw redirect({ to: '/onboarding' })

    await Promise.all([
      context.queryClient.ensureQueryData(taskTemplatesQueryOptions(membership.workspace_id)),
      context.queryClient.ensureQueryData(projectTemplatesQueryOptions(membership.workspace_id)),
    ])
  },
  component: PlantillasRoute,
})

function PlantillasRoute() {
  const { workspaceId } = useCurrentWorkspace()
  if (!workspaceId) return null
  return <TemplatesPage workspaceId={workspaceId} />
}
