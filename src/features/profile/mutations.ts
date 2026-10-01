import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateEmail, updateProfile, uploadAvatar } from '@/features/profile/api'
import { profileQueryOptions } from '@/features/profile/queries'
import { updatePassword } from '@/features/auth/api'
import type { Database } from '@/types/database'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

// Invalidación barata: la propia query de perfil + `workspace-members`
// (los pocos lugares que sí la consumen). Alcanza para la gran mayoría de
// los campos de `profiles` (tema, zona horaria, vista por defecto,
// formato de fecha, etc.) — ninguno de esos se muestra en más lugares que
// esos dos.
function invalidateProfileConsumers(queryClient: ReturnType<typeof useQueryClient>, userId: string) {
  queryClient.invalidateQueries({ queryKey: profileQueryOptions(userId).queryKey })
  queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
}

// `full_name`/`avatar_url` son la excepción: se embeben por join en una
// cantidad de queries que no tiene sentido enumerar una por una —
// tarjetas de tarea (`['tasks', containerId, ...]`), detalle de tarea,
// subtareas, comentarios, revisores, "Mis tareas"/delegadas/personales,
// búsqueda del command palette, reportes, adjuntos, actividad... cada una
// trae su PROPIA copia vía un `profiles(...)` embebido, cacheada bajo una
// key que no tiene ninguna relación con el `userId` que cambió. Antes
// `invalidateProfileConsumers` (arriba) se llamaba para TODO campo,
// incluida la foto, con el comentario (equivocado) de que invalidar
// `workspace-members` alcanzaba para "tarjetas de tarea, comentarios,
// etc.": no alcanzaba, esas vistas nunca leen de ahí. Reportado por el
// usuario: una foto recién subida no se veía en las tarjetas del board,
// solo las iniciales de siempre.
//
// Cambiar nombre/foto es un evento de una sola vez (no un hot-path como
// mover una tarea o tipear en Preferencias), así que invalidar TODO el
// caché acá es la solución correcta y no cara — mismo criterio de
// "excepción aceptada" que ya usa useCreateWorkspaceMutation
// (workspace/mutations.ts). Se llama SOLO cuando el cambio incluye
// full_name/avatar_url, no en cada guardado de Preferencias — invalidar
// todo en cada toggle de tema habría sido un desperdicio real (y un paso
// atrás en la suavidad que ya se cuidó para ese caso puntual).
function invalidateIdentityEverywhere(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries()
}

// Optimista (no solo invalidate-then-refetch): sin esto, entre el click y
// que el refetch del invalidate() de abajo resuelva, `profile.theme` en
// caché sigue mostrando el valor VIEJO por un instante — y
// useThemePreference (features/profile/use-theme-preference.ts) tiene un
// efecto que sincroniza next-themes DESDE `profile.theme`, así que ese
// instante de caché desactualizada alcanzaba para revertir el tema recién
// elegido y volver a aplicarlo, un FOUC real al tocar el toggle. El patch
// optimista dejá la caché correcta en el mismo tick que next-themes, sin
// ventana que ese efecto pueda pisar.
export function useUpdateProfileMutation(userId: string) {
  const queryClient = useQueryClient()
  const key = profileQueryOptions(userId).queryKey

  return useMutation({
    mutationFn: (fields: Partial<ProfileUpdate>) => updateProfile(userId, fields),
    onMutate: async (fields) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (old: typeof previous) => (old ? { ...old, ...fields } : old))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
    },
    onSuccess: (_data, fields) => {
      invalidateProfileConsumers(queryClient, userId)
      // `job_title` se suma a la excepción de `full_name`/`avatar_url`: se
      // autoedita desde acá (Perfil tab) pero se muestra embebido en
      // `peopleQueryOptions` (ficha de persona, organigrama) bajo una key
      // que no tiene relación con `userId` — mismo problema que ya
      // documenta el comentario de `invalidateIdentityEverywhere`.
      if (fields.full_name !== undefined || fields.job_title !== undefined) invalidateIdentityEverywhere(queryClient)
    },
  })
}

export function useUploadAvatarMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadAvatar(userId, file),
    onSuccess: () => {
      invalidateProfileConsumers(queryClient, userId)
      invalidateIdentityEverywhere(queryClient)
    },
  })
}

export function useUpdateEmailMutation() {
  return useMutation({ mutationFn: updateEmail })
}

// Desde el perfil siempre se manda la contraseña actual: el proyecto tiene
// activo "Require current password when updating", y aunque no lo tuviera,
// pedirla es lo correcto para un cambio hecho sobre una sesión ya abierta.
// El flujo de recuperación NO pasa por acá (llama a `updatePassword` directo
// sin la actual, ver ResetPasswordForm).
export function useUpdatePasswordMutation() {
  return useMutation({
    mutationFn: (vars: { password: string; currentPassword: string }) =>
      updatePassword(vars.password, vars.currentPassword),
  })
}
