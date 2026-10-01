import { useId, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export const MIN_PASSWORD_LENGTH = 8

/**
 * Reglas de contraseña, espejadas del proyecto Supabase.
 *
 * El dashboard tiene `Password requirements: Letters and digits` y
 * `Minimum password length: 8` (equivalente a `password_requirements =
 * "letters_digits"` en config.toml). Validar solo la longitud acá dejaba
 * pasar "contraseña" —8 letras, ningún dígito— y el rechazo llegaba recién
 * del servidor, después del round-trip y con un mensaje que hablaba de
 * longitud cuando el problema eran los dígitos.
 *
 * Sigue siendo el servidor el que decide; esto solo adelanta el diagnóstico.
 */
export function describePasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (!/\p{L}/u.test(password)) return 'Tiene que incluir al menos una letra.'
  if (!/\d/.test(password)) return 'Tiene que incluir al menos un número.'
  return null
}

export const PASSWORD_HINT = `Al menos ${MIN_PASSWORD_LENGTH} caracteres, con letras y números.`

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3
  label: string
  hint: string
}

/**
 * Heurística simple (largo + variedad de clases de caracteres), no zxcvbn:
 * agregar esa librería solo para un medidor de 4 barras en un único
 * formulario no se justificaba. Solo tiene sentido llamarla una vez que
 * `describePasswordProblem` ya no devuelve error — antes de eso mostrar
 * "Débil" sería redundante con el mensaje de requisito.
 */
export function passwordStrength(password: string): PasswordStrength {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length
  const { length } = password
  if (length >= 16 && classes >= 4) return { score: 3, label: 'Excelente', hint: 'Muy difícil de adivinar.' }
  if (length >= 12 && classes >= 3) return { score: 2, label: 'Buena', hint: 'Una frase más larga la hace más difícil de adivinar.' }
  if (length >= 10 && classes >= 2) return { score: 1, label: 'Regular', hint: 'Suma números, mayúsculas o símbolos para mejorarla.' }
  return { score: 0, label: 'Débil', hint: 'Cumple el mínimo, pero es fácil de adivinar.' }
}

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  /**
   * 'current-password' para iniciar sesión, 'new-password' para registro y
   * cambio. Es lo que le dice al gestor de contraseñas si debe autocompletar
   * o si debe ofrecer generar una nueva — ninguno de los formularios de auth
   * tenía este atributo, así que 1Password/Bitwarden/el llavero del navegador
   * no reconocían ningún campo.
   */
  autoComplete: 'current-password' | 'new-password'
  autoFocus?: boolean
  required?: boolean
  invalid?: boolean
  /** Texto de ayuda persistente (requisitos) o de error. */
  hint?: string
  hintTone?: 'muted' | 'danger'
  id?: string
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  required = true,
  invalid,
  hint,
  hintTone = 'muted',
  id,
}: PasswordFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const [visible, setVisible] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          minLength={autoComplete === 'new-password' ? MIN_PASSWORD_LENGTH : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={hint ? hintId : undefined}
          placeholder="••••••••"
          className="pr-9"
        />
        {/* `tabIndex={-1}`: el toggle no debe interponerse entre la contraseña
            y el botón de enviar al tabular — se alcanza con el mouse o
            navegando hacia atrás, que es como se usa en la práctica. */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          <HugeiconsIcon icon={visible ? ViewOffSlashIcon : ViewIcon} className="size-4" />
        </button>
      </div>
      {hint && (
        <span id={hintId} className={cn('text-xs', hintTone === 'danger' ? 'text-danger' : 'text-text-muted')}>
          {hint}
        </span>
      )}
    </div>
  )
}
