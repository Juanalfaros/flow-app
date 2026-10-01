-- 0014_node_icons_storage.sql — bucket público para íconos/imágenes
-- personalizadas de nodos (hoy solo lo usan los Espacios, ver
-- SpaceIconDialog.tsx). Mismo patrón que avatars (0010_avatars_storage.sql)
-- pero el "dueño" del path no es auth.uid() sino cualquier miembro del
-- workspace del nodo (reutiliza is_member_of, ya usado por nodes_all_member
-- en 0008_nodes_engine.sql). Path: `{node_id}/icon.{ext}`.

insert into storage.buckets (id, name, public)
values ('node-icons', 'node-icons', true)
on conflict (id) do nothing;

create policy "node_icons_public_read" on storage.objects
  for select using (bucket_id = 'node-icons');

create policy "node_icons_member_write" on storage.objects
  for all to authenticated using (
    bucket_id = 'node-icons' and exists (
      select 1 from public.nodes n
      where n.id = ((storage.foldername(name))[1])::uuid
        and public.is_member_of(n.workspace_id)
    )
  ) with check (
    bucket_id = 'node-icons' and exists (
      select 1 from public.nodes n
      where n.id = ((storage.foldername(name))[1])::uuid
        and public.is_member_of(n.workspace_id)
    )
  );
