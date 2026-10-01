-- 0019_node_icons_uuid_guard.sql — evita que un path mal formado en el bucket
-- `node-icons` aborte la sentencia en vez de denegarla.
--
-- `node_icons_member_write` (0014_node_icons_storage.sql) hace
-- `((storage.foldername(name))[1])::uuid`. La policy espera `{node_id}/icon.ext`
-- (lo que sube SpaceIconDialog.tsx), pero storage acepta cualquier `name`: si
-- el primer segmento no parsea como uuid, el cast lanza invalid_text_representation
-- y el usuario recibe un error de base en crudo en vez de un 403 limpio. Nada de
-- esto es explotable —no hay lectura de datos ajenos— pero convierte un caso de
-- borde en ruido de servidor, y el mensaje filtra el tipo de la columna.
--
-- `try_uuid` devuelve null cuando el texto no parsea; el `exists` con
-- `n.id = null` no matchea ninguna fila, así que la policy simplemente deniega.

create or replace function public.try_uuid(p_text text)
returns uuid
language plpgsql immutable set search_path = public
as $$
begin
  return p_text::uuid;
exception
  when invalid_text_representation then return null;
end;
$$;

grant execute on function public.try_uuid(text) to authenticated;

drop policy "node_icons_member_write" on storage.objects;

create policy "node_icons_member_write" on storage.objects
  for all to authenticated using (
    bucket_id = 'node-icons' and exists (
      select 1 from public.nodes n
      where n.id = public.try_uuid((storage.foldername(name))[1])
        and public.is_member_of(n.workspace_id)
    )
  ) with check (
    bucket_id = 'node-icons' and exists (
      select 1 from public.nodes n
      where n.id = public.try_uuid((storage.foldername(name))[1])
        and public.is_member_of(n.workspace_id)
    )
  );
