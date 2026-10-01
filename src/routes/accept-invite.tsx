import { createFileRoute } from '@tanstack/react-router'
import { SplitScreenLayout } from '@/components/layout/SplitScreenLayout'
import { AcceptInviteForm } from '@/features/auth/components/AcceptInviteForm'

export const Route = createFileRoute('/accept-invite')({
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  return (
    <SplitScreenLayout tagline="Te invitaron a un workspace en Flow.">
      <h1 className="mb-1 text-lg font-medium">Completa tu cuenta</h1>
      <p className="mb-6 text-sm text-text-secondary">Con tu nombre te reconocen en tareas y comentarios.</p>
      <AcceptInviteForm />
    </SplitScreenLayout>
  )
}
