import { supabase } from '@/lib/supabase'

export async function signInWithMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
      // `shouldCreateUser` es true por defecto: el magic link daba de alta al
      // usuario si el correo no existía, o sea que era una puerta de registro
      // paralela al formulario de "Crear cuenta". Con el registro cerrado
      // (0022_closed_signup.sql) eso ya no corresponde — acá solo se entra,
      // no se crea cuenta. El trigger de la base lo bloquearía igual, pero
      // así el usuario recibe un error claro en vez de un fallo de base.
      shouldCreateUser: false,
    },
  })
  if (error) throw error
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUpWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

/** Reenvía el correo de confirmación de una cuenta ya creada y sin confirmar. */
export async function resendSignupConfirmation(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

/**
 * Cambia la contraseña de la sesión activa.
 *
 * `currentPassword` es opcional a propósito, porque los dos llamadores están
 * en situaciones distintas:
 *
 *   - Perfil: el usuario sabe su contraseña actual y la escribe. Se manda como
 *     `current_password`, que es lo que exige el proyecto cuando está activo
 *     "Require current password when updating" en el dashboard.
 *   - Recuperación (ResetPasswordForm, y el enlace de invitación): por
 *     definición NO la sabe — el enlace del correo es la prueba de identidad.
 *     Ahí se omite el campo.
 *
 * Mandar `current_password: undefined` no es lo mismo que omitirlo: iría como
 * clave presente en el JSON y GoTrue podría tomarla como un intento fallido,
 * así que se arma el objeto condicionalmente.
 */
export async function updatePassword(password: string, currentPassword?: string) {
  const { error } = await supabase.auth.updateUser(
    currentPassword ? { password, current_password: currentPassword } : { password },
  )
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
