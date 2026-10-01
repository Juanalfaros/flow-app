import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { peopleQueryOptions } from '@/features/people/queries'
import { profileQueryOptions } from '@/features/profile/queries'

function describePeopleError(err: unknown): string {
  const e = (err ?? {}) as { code?: string; message?: string }
  // 42501: assert_admin_of, compartido por set_manager, update_member_role
  // y admin_update_profile (0024/0071) — genérico a propósito, no distingue
  // cuál de las tres lo lanzó.
  if (e.code === '42501') return 'Solo un administrador puede hacer este cambio.'
  // 22023 es el errcode que usan las validaciones de set_manager/
  // update_member_role (0024/0071). El mensaje viene de la base y ya está
  // en español y redactado para el usuario, así que se reenvía tal cual.
  if (e.code === '22023' && e.message) return e.message
  return 'No se pudo guardar el cambio. Vuelve a intentarlo.'
}

/**
 * Cargo y zona horaria: cada quien los suyos.
 *
 * `profiles_update_own` permite escribir la propia fila, y el trigger de 0024
 * congela las columnas que no deben tocarse desde el cliente (`email`,
 * `manager_id`, `last_seen_at`). O sea que esto no necesita RPC: la policy y
 * el trigger ya delimitan exactamente lo editable.
 */
export function useUpdateOwnOrgFieldsMutation(workspaceId: string, userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: { job_title?: string | null; timezone?: string | null }) => {
      const { error } = await supabase.from('profiles').update(fields).eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peopleQueryOptions(workspaceId).queryKey })
      queryClient.invalidateQueries({ queryKey: profileQueryOptions(userId).queryKey })
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
    },
    onError: (err) => toast.error(describePeopleError(err)),
  })
}

/**
 * Gestor: solo admin, y solo por RPC.
 *
 * No es un `update` directo a propósito. `manager_id` está congelado por el
 * trigger de 0024 justamente para que nadie se cuelgue de quien quiera en el
 * organigrama; `set_manager` es la única puerta, y de paso valida que el
 * gestor sea del mismo workspace y que el cambio no cierre un ciclo.
 */
export function useSetManagerMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { userId: string; managerId: string | null }) => {
      const { error } = await supabase.rpc('set_manager', {
        p_user_id: vars.userId,
        // El generador de tipos declara todo parámetro `uuid` como `string`, sin
        // contemplar que la función acepte NULL — y acá NULL es un valor con
        // significado: es cómo se quita el gestor y se deja a alguien en la raíz
        // del organigrama. El cast afirma lo que la firma SQL ya permite.
        p_manager_id: vars.managerId as string,
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryOptions(workspaceId).queryKey }),
    onError: (err) => toast.error(describePeopleError(err)),
  })
}

/**
 * Rol de otro miembro: solo admin/owner, y solo por RPC (0071, jerarquía
 * agregada en 0086 tras auditar el modelo de roles).
 *
 * `memberships_update_admin` (0003_rls.sql) ya permite el UPDATE directo a
 * cualquier admin/owner, pero `update_member_role` agrega las validaciones
 * que esa policy no puede expresar sola: rol válido, no tocar al dueño, no
 * poder cambiarse el rol a uno mismo, y (mismo criterio de 3 niveles que
 * `remove_member`, 0075) que un administrador no pueda tocar el rol de
 * OTRO administrador — eso es exclusivo del dueño.
 */
export function useUpdateMemberRoleMutation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { userId: string; role: string }) => {
      const { error } = await supabase.rpc('update_member_role', { p_user_id: vars.userId, p_role: vars.role })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryOptions(workspaceId).queryKey }),
    onError: (err) => toast.error(describePeopleError(err)),
  })
}

/**
 * Sacar a alguien del workspace: solo admin/owner, y solo por RPC (0075).
 * Jerarquía de 3 niveles pedida por el usuario, validada server-side (la
 * RPC, y la policy de RLS como segunda capa): el dueño puede sacar a
 * cualquiera; un administrador puede sacar a cualquiera MENOS a otro
 * administrador y MENOS al dueño. Nadie se saca a sí mismo por acá.
 * Invalida TODO el caché (mismo motivo que useAdminUpdateProfileMutation):
 * esta persona desaparece de cada picker/avatar-stack/filtro que la tenía
 * cacheada, sin relación con workspaceId/userId para poder apuntarles uno
 * por uno.
 */
export function useRemoveMemberMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('remove_member', { p_user_id: userId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (err) => toast.error(describePeopleError(err)),
  })
}

/**
 * Nombre/cargo de otro miembro: solo admin/owner, y solo por RPC (0071).
 *
 * A diferencia de `useUpdateOwnOrgFieldsMutation` (self, UPDATE directo
 * porque `profiles_update_own` ya lo permite), acá la fila no es la propia
 * — `profiles_update_own` la bloquea a propósito, así que hace falta la
 * RPC `security definer` para bypasearla con la validación de admin
 * adentro. Reemplaza los 3 campos de una: el formulario de edición siempre
 * manda el snapshot completo (nombre/foto/cargo actuales + lo que cambió),
 * no un parche.
 */
export function useAdminUpdateProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { userId: string; fullName: string; avatarUrl: string | null; jobTitle: string | null }) => {
      const { error } = await supabase.rpc('admin_update_profile', {
        p_user_id: vars.userId,
        p_full_name: vars.fullName,
        p_avatar_url: vars.avatarUrl as string,
        p_job_title: vars.jobTitle as string,
      })
      if (error) throw error
    },
    // Invalida TODO el caché, no solo peopleQueryOptions/profile/
    // workspace-members: full_name se embebe por join en tarjetas de
    // tarea, comentarios, revisores, etc. — cada una con su propia copia,
    // sin relación con `workspaceId`/`userId` para poder apuntarles una
    // por una. Ver la explicación completa en
    // features/profile/mutations.ts (invalidateIdentityEverywhere),
    // mismo motivo exacto, solo que acá el update SIEMPRE toca full_name
    // (a diferencia de useUpdateProfileMutation, que a veces solo cambia
    // tema/zona horaria y no necesita este martillo).
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (err) => toast.error(describePeopleError(err)),
  })
}

/**
 * Foto de otro miembro: sube el archivo (permitido por las policies de
 * storage `avatars_admin_insert`/`avatars_admin_update`, 0071) y persiste
 * la URL vía `admin_update_profile` — NO el `.update()` directo que usa
 * `uploadAvatar` (features/profile/api.ts) para la foto propia, porque ese
 * update caería en `profiles_update_own` y un admin editando a otra
 * persona no la cumple. `fullName`/`jobTitle` van sin cambios (valor
 * actual del formulario): la RPC reemplaza los 3 campos juntos.
 */
export function useAdminUploadAvatarMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { userId: string; file: File; fullName: string; jobTitle: string | null }) => {
      const ext = vars.file.name.split('.').pop() ?? 'jpg'
      const path = `${vars.userId}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, vars.file, { upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${data.publicUrl}?t=${Date.now()}`

      const { error } = await supabase.rpc('admin_update_profile', {
        p_user_id: vars.userId,
        p_full_name: vars.fullName,
        p_avatar_url: avatarUrl,
        p_job_title: vars.jobTitle as string,
      })
      if (error) throw error
      return avatarUrl
    },
    // Mismo motivo que useAdminUpdateProfileMutation arriba: avatar_url
    // se embebe por join en demasiados lugares para invalidarlos uno por
    // uno.
    onSuccess: () => queryClient.invalidateQueries(),
    onError: () => toast.error('No se pudo subir la foto. Prueba con otra imagen.'),
  })
}
