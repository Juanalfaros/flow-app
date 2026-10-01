import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { updatePassword } from '@/features/auth/api'
import { useSession } from '@/features/auth/queries'
import { updateProfile } from '@/features/profile/api'
import { describeAuthError } from '@/features/auth/error-messages'
import { PASSWORD_HINT, PasswordField, describePasswordProblem } from '@/features/auth/components/PasswordField'

/**
 * Alta de una persona invitada: nombre, apellido y contraseña.
 *
 * Antes esta pantalla reusaba `ResetPasswordForm`, que solo pide contraseña.
 * El problema: `inviteUserByEmail` crea el usuario sin `full_name`, así que
 * `handle_new_user` guardaba `profiles.full_name = null` y toda la app caía a
 * su fallback — el UUID crudo en la lista de miembros, un "?" en cada avatar.
 * Nadie deduce que eso se arregla yendo a /profile, así que el nombre se pide
 * acá, que es el único momento en que la persona está obligada a pasar.
 */
export function AcceptInviteForm() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()

  const mutation = useMutation({
    mutationFn: async () => {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const userId = session?.user.id
      if (!userId) throw new Error('No hay sesión activa')

      // Sin `currentPassword`: la persona invitada todavía no tiene una, y la
      // prueba de identidad es el enlace del correo (ver updatePassword).
      await updatePassword(password)

      // Dos escrituras porque son dos fuentes distintas y ninguna deriva de la
      // otra después del alta:
      //   - auth.users.raw_user_meta_data -> lo que muestra el dashboard de
      //     Supabase, y de donde `handle_new_user` lee en el INSERT.
      //   - public.profiles.full_name -> lo que lee la app (avatares,
      //     asignados, comentarios). El trigger solo lo puebla al crear el
      //     usuario, así que a esta altura ya corrió con el valor vacío.
      await supabase.auth.updateUser({ data: { full_name: fullName } })
      await updateProfile(userId, { full_name: fullName })
    },
    onSuccess: () => {
      toast.success(`¡Bienvenido/a, ${firstName.trim()}!`)
      navigate({ to: '/' })
    },
    onError: (error) => toast.error(describeAuthError(error)),
  })

  if (isPending) {
    return <p className="text-sm text-text-muted">Validando invitación…</p>
  }

  // Abrir el enlace de invitación crea una sesión. Sin ella, el enlace venció,
  // ya se usó, o alguien llegó escribiendo la URL a mano.
  if (!session) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-danger-bg">
          <HugeiconsIcon icon={Alert02Icon} className="size-4.5 text-danger-text" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Esta invitación ya no sirve</h2>
          <p className="text-sm text-text-secondary">
            Los enlaces vencen y solo se pueden usar una vez. Pídele a quien te invitó que te mande uno nuevo.
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/login">Ir a iniciar sesión</Link>
        </Button>
      </div>
    )
  }

  const passwordProblem = password.length > 0 ? describePasswordProblem(password) : null
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    password.length > 0 &&
    !describePasswordProblem(password) &&
    password === confirm

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        mutation.mutate()
      }}
    >
      {session.user.email && (
        <p className="text-sm text-text-secondary">
          Estás entrando como <span className="font-medium text-text">{session.user.email}</span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="first-name">Nombre</Label>
          <Input
            id="first-name"
            autoComplete="given-name"
            autoFocus
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ana"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="last-name">Apellido</Label>
          <Input
            id="last-name"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Pérez"
          />
        </div>
      </div>

      <PasswordField
        id="invite-password"
        label="Contraseña"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        invalid={!!passwordProblem}
        hint={passwordProblem ?? PASSWORD_HINT}
        hintTone={passwordProblem ? 'danger' : 'muted'}
      />
      <PasswordField
        id="invite-password-confirm"
        label="Confirmar contraseña"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        invalid={mismatch}
        hint={mismatch ? 'Las contraseñas no coinciden.' : undefined}
        hintTone="danger"
      />

      <Button type="submit" disabled={!canSubmit || mutation.isPending}>
        {mutation.isPending ? 'Entrando…' : 'Entrar al workspace'}
      </Button>
    </form>
  )
}
