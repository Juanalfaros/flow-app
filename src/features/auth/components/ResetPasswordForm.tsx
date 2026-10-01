import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { updatePassword } from '@/features/auth/api'
import { useSession } from '@/features/auth/queries'
import { describeAuthError } from '@/features/auth/error-messages'
import { PASSWORD_HINT, PasswordField, describePasswordProblem } from '@/features/auth/components/PasswordField'

export function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()

  const mutation = useMutation({
    mutationFn: () => updatePassword(password),
    onSuccess: () => {
      toast.success('Contraseña actualizada.')
      navigate({ to: '/' })
    },
    onError: (error) => toast.error(describeAuthError(error)),
  })

  // Abrir un enlace de recuperación crea una sesión; sin ella el enlace venció,
  // ya se usó, o alguien llegó a /reset-password escribiendo la URL a mano.
  // Antes el formulario se mostraba igual y recién fallaba al enviar, con un
  // mensaje genérico y sin decir qué hacer después.
  if (isPending) {
    return <p className="text-sm text-text-muted">Validando enlace…</p>
  }

  if (!session) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-danger-bg">
          <HugeiconsIcon icon={Alert02Icon} className="size-4.5 text-danger-text" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Este enlace ya no sirve</h2>
          <p className="text-sm text-text-secondary">
            Los enlaces de recuperación vencen y solo se pueden usar una vez. Pide uno nuevo para continuar.
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/login">Volver a iniciar sesión</Link>
        </Button>
      </div>
    )
  }

  const passwordProblem = password.length > 0 ? describePasswordProblem(password) : null
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = password.length > 0 && !describePasswordProblem(password) && password === confirm

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        mutation.mutate()
      }}
    >
      {/* Campo de confirmación, que acá no existía aunque el de perfil sí lo
          tenía: es la única oportunidad de detectar un tipeo en una contraseña
          que no se ve y que deja la cuenta inaccesible si sale mal. Y
          MIN_PASSWORD_LENGTH unifica el mínimo — este formulario pedía 6 y el
          de perfil 8, sobre la misma cuenta. */}
      <PasswordField
        id="new-password"
        label="Nueva contraseña"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        autoFocus
        invalid={!!passwordProblem}
        hint={passwordProblem ?? PASSWORD_HINT}
        hintTone={passwordProblem ? 'danger' : 'muted'}
      />
      <PasswordField
        id="confirm-new-password"
        label="Confirmar contraseña"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        invalid={mismatch}
        hint={mismatch ? 'Las contraseñas no coinciden.' : undefined}
        hintTone="danger"
      />
      <Button type="submit" disabled={!canSubmit || mutation.isPending}>
        {mutation.isPending ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  )
}
