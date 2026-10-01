import { HugeiconsIcon } from '@hugeicons/react'
import { MailAtSign01Icon, ArrowLeft02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

interface AuthSentStateProps {
  email: string
  title: string
  description: string
  /** Vuelve al formulario — la salida que antes no existía. */
  onBack: () => void
  onResend?: () => void
  resending?: boolean
}

/**
 * Pantalla de "te enviamos un correo", compartida por el magic link, el alta
 * de cuenta y la recuperación de contraseña.
 *
 * Los tres estados eran antes un `<p>` de texto plano sin ninguna acción: si
 * escribías mal el correo —el error más común justo en ese paso— no había
 * forma de corregirlo salvo recargar la página, y tampoco de reenviar si el
 * mensaje no llegaba. Además el correo se mostraba entre paréntesis en medio
 * de la frase, donde es fácil no leerlo; acá va destacado, que es lo que hay
 * que verificar.
 */
export function AuthSentState({ email, title, description, onBack, onResend, resending }: AuthSentStateProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft">
        <HugeiconsIcon icon={MailAtSign01Icon} className="size-4.5 text-accent-text-on-bg" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
      <p className="w-full truncate rounded-md bg-surface-alt px-2.5 py-1.5 text-sm font-medium" title={email}>
        {email}
      </p>
      <div className="flex w-full items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <HugeiconsIcon icon={ArrowLeft02Icon} />
          Cambiar correo
        </Button>
        {onResend && (
          <Button variant="ghost" size="sm" onClick={onResend} disabled={resending}>
            {resending ? 'Reenviando…' : 'Reenviar'}
          </Button>
        )}
      </div>
      <p className="text-xs text-text-muted">
        ¿No llega? Revisa la carpeta de spam antes de volver a pedirlo.
      </p>
    </div>
  )
}
