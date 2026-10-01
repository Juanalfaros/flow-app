import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

// `full_name` sigue siendo el único campo obligatorio históricamente, pero
// esta función ahora también sirve para persistir cualquier preferencia de
// PreferencesSection (tema, vista por defecto, etc.) — todas opcionales,
// se manda solo lo que cambió.
export async function updateProfile(
  userId: string,
  fields: Partial<ProfileUpdate>,
) {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId)
  if (error) throw error
}

// `auth.updateUser({ email })` dispara el flujo de "secure email change" de
// Supabase (confirmación por correo a la dirección nueva, y en algunos
// proyectos también a la vieja) — el email en auth.users NO cambia hasta
// que el usuario confirma el link. `profiles.email` es una copia
// desnormalizada sin trigger de UPDATE (solo se seedea en el insert del
// signup, ver 0001_init.sql), así que queda desactualizada hasta que se
// agregue ese trigger — aceptable por ahora, el email "real" sigue siendo
// el de auth.users.
export async function updateEmail(email: string) {
  const { error } = await supabase.auth.updateUser({ email })
  if (error) throw error
}

// Sube a `{userId}/avatar.{ext}` (path estable, no un uuid por archivo) a
// propósito: permite `upsert: true` en vez de acumular archivos huérfanos
// cada vez que el usuario cambia de foto, y matchea la policy de storage
// (0010_avatars_storage.sql) que compara el primer segmento del path
// contra auth.uid(). El query param `?t=` al final de la URL pública es
// para invalidar el cache del navegador/CDN ante el mismo path.
export async function uploadAvatar(userId: string, file: File) {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/avatar.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const avatar_url = `${data.publicUrl}?t=${Date.now()}`

  const { error: updateError } = await supabase.from('profiles').update({ avatar_url }).eq('id', userId)
  if (updateError) throw updateError

  return avatar_url
}
