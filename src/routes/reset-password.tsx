import { createFileRoute } from '@tanstack/react-router'
import { SplitScreenLayout } from '@/components/layout/SplitScreenLayout'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  return (
    <SplitScreenLayout tagline="Gestión de tareas para equipos que se mueven rápido.">
      <h1 className="mb-6 text-lg font-medium">Elige una nueva contraseña</h1>
      <ResetPasswordForm />
    </SplitScreenLayout>
  )
}
