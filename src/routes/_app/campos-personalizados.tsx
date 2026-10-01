import { createFileRoute, redirect } from '@tanstack/react-router'
import { membershipsQueryOptions, useCurrentWorkspace } from '@/features/workspace/queries'
import { CustomFieldsManagerPage } from '@/features/custom-fields/components/CustomFieldsManagerPage'

export const Route = createFileRoute('/_app/campos-personalizados')({
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    if (memberships.length === 0) throw redirect({ to: '/onboarding' })
  },
  component: CamposPersonalizadosRoute,
})

function CamposPersonalizadosRoute() {
  const { workspaceId } = useCurrentWorkspace()
  if (!workspaceId) return null
  return <CustomFieldsManagerPage workspaceId={workspaceId} />
}
