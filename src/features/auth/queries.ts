import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: ['session'] as const,
    queryFn: async (): Promise<Session | null> => {
      const { data } = await supabase.auth.getSession()
      return data.session
    },
    // AuthListener empuja los cambios de sesión vía onAuthStateChange;
    // no hace falta refetch automático.
    staleTime: Infinity,
  })

export function useSession() {
  return useQuery(sessionQueryOptions())
}

/**
 * Si el registro sigue abierto — o sea, si todavía no existe ningún usuario.
 *
 * El acceso es cerrado (ver 0022_closed_signup.sql): la primera cuenta que se
 * crea es la de quien monta el workspace, y desde ese momento solo se entra
 * por invitación. El login usa esto para no ofrecer un formulario de "Crear
 * cuenta" que el servidor va a rechazar.
 *
 * Es solo presentación: quien llame igual a `signUp` choca con el trigger de
 * la base. La autorización no depende de este valor.
 */
export const signupOpenQueryOptions = () =>
  queryOptions({
    queryKey: ['signup-open'] as const,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('is_signup_open')
      // Ante un fallo (red, RPC vieja) se asume cerrado: es el estado normal
      // del sistema una vez inicializado, y equivocarse hacia "cerrado" solo
      // esconde un formulario, mientras que equivocarse hacia "abierto"
      // promete algo que el servidor va a rechazar.
      if (error) return false
      return data ?? false
    },
    staleTime: Infinity,
  })

export function useSignupOpen() {
  return useQuery(signupOpenQueryOptions())
}
