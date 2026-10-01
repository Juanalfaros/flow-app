import { createFileRoute, redirect } from '@tanstack/react-router'
import { membershipsQueryOptions, useCurrentWorkspace } from '@/features/workspace/queries'
import { sessionQueryOptions } from '@/features/auth/queries'
import { projectsQueryOptions } from '@/features/projects/queries'
import { CompartirPage } from '@/features/share-target/components/CompartirPage'

// Destino del Share Target (manifest.webmanifest → share_target, src/sw.ts)
// — Android entrega acá lo compartido desde otra app. Nunca se navega a
// mano, así que solo hace falta lo mínimo para renderizar: workspace +
// sesión (igual que bandeja.tsx) y la lista de proyectos para el picker.
export const Route = createFileRoute('/_app/compartir')({
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    const membership = memberships[0]
    if (!membership) throw redirect({ to: '/onboarding' })

    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    if (!session) throw redirect({ to: '/login' })

    await context.queryClient.ensureQueryData(projectsQueryOptions(membership.workspace_id))
  },
  component: CompartirRoute,
})

function CompartirRoute() {
  const { workspaceId } = useCurrentWorkspace()
  if (!workspaceId) return null
  return <CompartirPage workspaceId={workspaceId} />
}
