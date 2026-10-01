-- 0010_avatars_storage.sql — bucket público para avatares de perfil.
-- Cada usuario sube a su propia carpeta (`{user_id}/...`); lectura es
-- pública (los avatares se muestran a otros miembros del workspace vía
-- <img>, sin pasar por RLS de una query autenticada), escritura/edición/
-- borrado quedan restringidos a la carpeta propia comparando el primer
-- segmento del path (`storage.foldername`) contra `auth.uid()`.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_own_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_own_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_own_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
