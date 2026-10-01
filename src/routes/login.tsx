import { createFileRoute, redirect } from '@tanstack/react-router'
import { SplitScreenLayout } from '@/components/layout/SplitScreenLayout'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { sessionQueryOptions } from '@/features/auth/queries'
import { profileQueryOptions } from '@/features/profile/queries'
import { startPageToRoute } from '@/features/profile/start-page'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    if (!session) return

    // AuthListener.tsx invalida el router al iniciar sesión, y eso es lo
    // que hace que este `beforeLoad` se vuelva a evaluar y redirija — este
    // es el único punto de entrada real de "Al abrir Flow, empezar en"
    // (profiles.start_page, 0093_profile_preferences_v2.sql). Sin `.catch`
    // el perfil bloquearía el ingreso entero si esa query fallara por
    // cualquier motivo — mejor caer al default ('/') que dejar a alguien
    // varado en /login con sesión ya iniciada.
    const profile = await context.queryClient.ensureQueryData(profileQueryOptions(session.user.id)).catch(() => null)
    throw redirect({ to: startPageToRoute(profile?.start_page) })
  },
  component: LoginPage,
})

function LoginPage() {
  return (
    <SplitScreenLayout tagline="Gestión de tareas para equipos que se mueven rápido.">
      <h1 className="mb-6 text-lg font-medium">Entrar</h1>
      <LoginForm />
    </SplitScreenLayout>
  )
}
