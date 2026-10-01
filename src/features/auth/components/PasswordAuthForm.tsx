import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset, resendSignupConfirmation, signInWithPassword, signUpWithPassword } from '@/features/auth/api'
import { useSignupOpen } from '@/features/auth/queries'
import { describeAuthError } from '@/features/auth/error-messages'
import { PASSWORD_HINT, PasswordField, describePasswordProblem } from '@/features/auth/components/PasswordField'
import { AuthSentState } from '@/features/auth/components/AuthSentState'

type Mode = 'sign-in' | 'sign-up'

export function PasswordAuthForm() {
  const [mode, setMode] = useState<Mode>('sign-in')
  // El registro está cerrado salvo para la primera cuenta del proyecto (ver
  // 0022_closed_signup.sql). Mientras carga se asume cerrado, para no mostrar
  // "Crear una cuenta" durante un instante y que desaparezca.
  const { data: signupOpen = false } = useSignupOpen()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signedUp, setSignedUp] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const authMutation = useMutation({
    mutationFn: async () => {
      if (mode === 'sign-in') await signInWithPassword(email, password)
      else await signUpWithPassword(email, password)
    },
    onSuccess: () => {
      if (mode === 'sign-up') setSignedUp(true)
    },
    // describeAuthError en vez de `error.message`: el texto crudo de GoTrue
    // llegaba en inglés en medio de una app en español, y podía distinguir
    // "ese correo no existe" de "la contraseña está mal" — justamente lo que
    // no conviene revelar (enumeración de usuarios).
    onError: (error) => toast.error(describeAuthError(error)),
  })

  const resendMutation = useMutation({
    mutationFn: () => resendSignupConfirmation(email),
    onSuccess: () => toast.success('Correo reenviado'),
    onError: (error) => toast.error(describeAuthError(error)),
  })

  const resetMutation = useMutation({
    mutationFn: () => requestPasswordReset(email),
    onSuccess: () => setResetSent(true),
    onError: (error) => toast.error(describeAuthError(error)),
  })

  // Antes estos dos estados eran un <p> suelto sin salida: con el correo mal
  // escrito, la única forma de corregirlo era recargar la página.
  if (signedUp) {
    return (
      <AuthSentState
        email={email}
        title="Revisa tu correo"
        description="Te enviamos un enlace para confirmar tu cuenta. Tienes que confirmarla antes de poder entrar."
        onBack={() => {
          setSignedUp(false)
          setPassword('')
        }}
        onResend={() => resendMutation.mutate()}
        resending={resendMutation.isPending}
      />
    )
  }

  if (resetSent) {
    return (
      <AuthSentState
        email={email}
        title="Enlace enviado"
        description="Abre el enlace que te mandamos para elegir una contraseña nueva."
        onBack={() => setResetSent(false)}
        onResend={() => resetMutation.mutate()}
        resending={resetMutation.isPending}
      />
    )
  }

  const isSignUp = mode === 'sign-up'
  // Solo al registrarse: al iniciar sesión la contraseña ya existe, y marcar
  // en rojo una contraseña vieja que no cumple las reglas nuevas sería ruido.
  const passwordProblem = isSignUp && password.length > 0 ? describePasswordProblem(password) : null

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        authMutation.mutate()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password-email">Email</Label>
        <Input
          id="password-email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.com"
        />
      </div>

      <PasswordField
        id="password"
        label="Contraseña"
        value={password}
        onChange={setPassword}
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
        invalid={!!passwordProblem}
        hint={isSignUp ? (passwordProblem ?? PASSWORD_HINT) : undefined}
        hintTone={passwordProblem ? 'danger' : 'muted'}
      />

      <Button type="submit" disabled={authMutation.isPending || !!passwordProblem}>
        {authMutation.isPending
          ? isSignUp
            ? 'Creando cuenta…'
            : 'Entrando…'
          : isSignUp
            ? 'Crear cuenta'
            : 'Iniciar sesión'}
      </Button>

      <div className="flex items-center justify-between gap-2 text-sm">
        {/* El alternador solo existe mientras el registro esté abierto, o sea
            hasta que se cree la primera cuenta. Después, ofrecerlo sería
            mandar a la gente a un formulario que el servidor rechaza. */}
        {signupOpen ? (
          <button
            type="button"
            className="text-text-muted underline-offset-4 hover:text-text hover:underline"
            onClick={() => {
              setMode(isSignUp ? 'sign-in' : 'sign-up')
              setPassword('')
            }}
          >
            {isSignUp ? 'Ya tengo cuenta' : 'Crear una cuenta'}
          </button>
        ) : (
          <span />
        )}
        {!isSignUp && (
          // Antes era `disabled={!email}`: sin correo escrito el botón no
          // hacía nada y tampoco decía por qué. Ahora siempre responde y
          // señala qué falta.
          <button
            type="button"
            className="text-text-muted underline-offset-4 hover:text-text hover:underline"
            disabled={resetMutation.isPending}
            onClick={() => {
              if (!email.trim()) {
                toast.info('Escribe tu correo primero.')
                document.getElementById('password-email')?.focus()
                return
              }
              resetMutation.mutate()
            }}
          >
            {resetMutation.isPending ? 'Enviando…' : 'Olvidé mi contraseña'}
          </button>
        )}
      </div>
    </form>
  )
}
