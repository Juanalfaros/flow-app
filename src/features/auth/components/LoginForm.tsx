import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { signInWithMagicLink } from '@/features/auth/api'
import { useSignupOpen } from '@/features/auth/queries'
import { clearAuthErrorFromUrl, describeAuthError, readAuthErrorFromUrl } from '@/features/auth/error-messages'
import { AuthSentState } from '@/features/auth/components/AuthSentState'
import { PasswordAuthForm } from '@/features/auth/components/PasswordAuthForm'

function MagicLinkForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const mutation = useMutation({
    mutationFn: signInWithMagicLink,
    onSuccess: () => setSent(true),
    onError: (error) => toast.error(describeAuthError(error)),
  })

  if (sent) {
    return (
      <AuthSentState
        email={email}
        title="Revisa tu correo"
        description="Te enviamos un enlace para entrar. Ábrelo desde este mismo dispositivo."
        onBack={() => setSent(false)}
        onResend={() => mutation.mutate(email)}
        resending={mutation.isPending}
      />
    )
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate(email)
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@empresa.com"
        />
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Enviando…' : 'Enviar enlace de acceso'}
      </Button>
      <p className="text-xs text-text-muted">Sin contraseña: te mandamos un enlace de un solo uso.</p>
    </form>
  )
}

/**
 * Aviso de enlace vencido o inválido.
 *
 * Cuando un magic link o un enlace de recuperación expira o ya fue usado,
 * GoTrue redirige de vuelta con `#error=…&error_code=otp_expired`. El cliente
 * de Supabase limpia ese hash pero nadie lo leía, así que el usuario aterrizaba
 * en /login sin ninguna explicación — el desenlace más probable era pedir otro
 * enlace y toparse con lo mismo sin entender por qué.
 */
function ExpiredLinkNotice() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const found = readAuthErrorFromUrl()
    if (!found) return
    setMessage(found)
    // Se saca de la URL para que no reaparezca al recargar ni quede en el
    // historial del navegador.
    clearAuthErrorFromUrl()
  }, [])

  if (!message) return null

  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2">
      <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-danger-text" />
      <p className="text-xs text-danger-text">{message}</p>
    </div>
  )
}

/**
 * Explica cómo se entra, según si el proyecto ya fue inicializado.
 *
 * Sin esto, alguien sin invitación se quedaba mirando un formulario de login
 * sin ninguna pista de que no puede crearse una cuenta — probaría, fallaría, y
 * no sabría que lo que le falta es que alguien lo invite.
 */
function AccessNotice() {
  const { data: signupOpen, isPending } = useSignupOpen()
  if (isPending) return null

  return (
    <p className="mt-4 text-xs text-text-muted">
      {signupOpen
        ? 'Esta es la primera cuenta del proyecto: al crearla quedas como administrador y podrás invitar al resto del equipo.'
        : 'El acceso es por invitación. Si tu equipo ya usa Flow, pídele a un administrador que te invite.'}
    </p>
  )
}

export function LoginForm() {
  return (
    <>
      <ExpiredLinkNotice />
      <Tabs defaultValue="password">
        <TabsList className="mb-4 w-full">
          {/* "Contraseña" primero: es la pestaña de quien ya tiene cuenta, o
              sea la mayoría de las visitas a /login pasado el primer día. El
              enlace por correo queda a un click para quien lo prefiera. */}
          <TabsTrigger value="password">Contraseña</TabsTrigger>
          <TabsTrigger value="magic-link">Enlace por correo</TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <PasswordAuthForm />
        </TabsContent>
        <TabsContent value="magic-link">
          <MagicLinkForm />
        </TabsContent>
      </Tabs>
      <AccessNotice />
    </>
  )
}
