import { createFileRoute, redirect } from '@tanstack/react-router'
import { SplitScreenLayout } from '@/components/layout/SplitScreenLayout'
import { OnboardingForm } from '@/features/workspace/components/OnboardingForm'
import { membershipsQueryOptions } from '@/features/workspace/queries'

export const Route = createFileRoute('/_app/onboarding')({
  // Sin este guard, alguien que YA tiene workspace podía entrar a /onboarding
  // escribiendo la URL y crear un segundo. Toda la app resuelve el workspace
  // como `memberships[0]` (ver useCurrentWorkspace) y la query ordena por
  // `created_at` ascendente, así que el workspace nuevo queda último:
  // invisible en el sidebar. Peor, `useCreateWorkspaceMutation` navega al
  // proyecto recién creado —que pertenece al workspace 2— mientras el resto
  // de la UI sigue apuntando al 1: etiquetas, miembros y filtros quedan
  // leyendo el workspace equivocado, sin forma obvia de volver.
  beforeLoad: async ({ context }) => {
    const memberships = await context.queryClient.ensureQueryData(membershipsQueryOptions())
    if (memberships.length > 0) throw redirect({ to: '/' })
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  return (
    <SplitScreenLayout tagline="Un espacio de trabajo por equipo. Empieza con uno.">
      <h1 className="mb-6 text-lg font-medium">Crea tu workspace</h1>
      <OnboardingForm />
    </SplitScreenLayout>
  )
}
