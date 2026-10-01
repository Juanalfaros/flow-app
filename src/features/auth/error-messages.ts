// Traducción de los errores de GoTrue a español.
//
// Antes, PasswordAuthForm hacía `toast.error(error.message)` con el texto
// crudo de Supabase: el usuario veía "Invalid login credentials" o "User
// already registered" en inglés, en medio de una app enteramente en español.
//
// Además del idioma hay un motivo de seguridad para no reenviar el mensaje
// crudo: no confirmar si un email existe o no (enumeración de usuarios). Por
// eso "credenciales inválidas" no distingue entre "ese correo no existe" y
// "la contraseña está mal" — es la misma respuesta a propósito.

interface AuthErrorLike {
  message?: string
  code?: string
  status?: number
}

export function describeAuthError(error: unknown): string {
  const e = (error ?? {}) as AuthErrorLike
  const code = e.code ?? ''
  const msg = (e.message ?? '').toLowerCase()

  // `code` es estable entre versiones; `message` es el fallback para las
  // respuestas viejas de GoTrue que todavía no lo traen.
  // Antes que `invalid_credentials`: cambiar la contraseña desde el perfil con
  // la actual equivocada devuelve ese mismo código, y "Correo o contraseña
  // incorrectos" no tiene sentido ahí — no hay ningún correo en juego.
  if (msg.includes('current password')) {
    return 'La contraseña actual no es correcta.'
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.'
  }
  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return 'Ya existe una cuenta con ese correo. Inicia sesión.'
  }
  // El proyecto exige 8 caracteres CON letras y números (Password
  // requirements: letters_digits). El mensaje anterior solo hablaba de
  // longitud, así que a quien escribía 8 letras sin dígitos le decía algo que
  // ya estaba cumpliendo. `describePasswordProblem` (PasswordField.tsx) ataja
  // el caso antes de llegar al servidor; esto cubre el resto.
  if (code === 'weak_password' || msg.includes('password should be')) {
    return 'La contraseña es demasiado débil: usa al menos 8 caracteres, con letras y números.'
  }
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit') || e.status === 429) {
    return 'Demasiados intentos. Espera un minuto antes de volver a probar.'
  }
  if (code === 'same_password' || msg.includes('should be different')) {
    return 'La contraseña nueva tiene que ser distinta de la actual.'
  }
  if (code === 'session_not_found' || code === 'flow_state_expired' || msg.includes('expired')) {
    return 'El enlace expiró. Pide uno nuevo.'
  }
  // Registro cerrado (0022_closed_signup.sql). El trigger sobre auth.users
  // aborta el INSERT, y GoTrue traduce cualquier fallo de base en ese punto a
  // "Database error saving new user" — un texto que no le dice nada al
  // usuario, así que se reemplaza por el motivo real.
  if (
    code === 'signup_disabled' ||
    msg.includes('database error saving new user') ||
    msg.includes('registro está cerrado') ||
    msg.includes('signups not allowed')
  ) {
    return 'El registro está cerrado. Se entra solo por invitación — pídele acceso a un administrador.'
  }
  // `shouldCreateUser: false` en el magic link (auth/api.ts): si el correo no
  // tiene cuenta, GoTrue responde así en vez de crearla.
  if (code === 'otp_disabled' || msg.includes('signups not allowed for otp')) {
    return 'No hay ninguna cuenta con ese correo. Se entra solo por invitación.'
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return 'Sin conexión. Revisa tu red e intenta de nuevo.'
  }
  return 'No se pudo completar la operación. Intenta de nuevo.'
}

/**
 * Errores que Supabase devuelve en el FRAGMENTO de la URL (no en el query
 * string): al volver de un magic link vencido o ya usado, GoTrue redirige a
 * `<site_url>/#error=access_denied&error_code=otp_expired&error_description=…`.
 *
 * `detectSessionInUrl` del cliente de Supabase consume el hash cuando trae un
 * `access_token`, pero cuando trae un error se limita a limpiarlo — nadie lo
 * leía, así que el usuario aterrizaba en /login sin ninguna explicación de por
 * qué el enlace no funcionó, y lo más probable era que volviera a pedir otro y
 * repitiera el mismo error.
 */
export function readAuthErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  const search = window.location.search.replace(/^\?/, '')
  if (!hash && !search) return null

  const params = new URLSearchParams(hash || search)
  const code = params.get('error_code')
  const error = params.get('error')
  if (!code && !error) return null

  if (code === 'otp_expired') return 'El enlace expiró o ya fue usado. Pide uno nuevo abajo.'
  if (code === 'access_denied' || error === 'access_denied') return 'El enlace no es válido. Pide uno nuevo abajo.'
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'No pudimos validar el enlace. Pide uno nuevo abajo.'
}

/** Limpia el hash/query de error para que no reaparezca al recargar. */
export function clearAuthErrorFromUrl() {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', window.location.pathname)
}
