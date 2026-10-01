-- 0061_node_archiving.sql — Archivar/Archivados (menú de espacio +
-- "Vistas globales" del sidebar).
--
-- `archived_at` vive en `nodes` (no una tabla aparte, a diferencia de
-- hidden_nodes): archivar es workspace-wide, no una preferencia por
-- usuario — todo el mundo deja de ver el espacio en el árbol normal, y
-- cualquiera con acceso puede restaurarlo desde /archivados.

alter table public.nodes add column archived_at timestamptz;

-- Parcial: el árbol normal siempre filtra `archived_at is null` (la
-- inmensa mayoría de las filas), y /archivados siempre filtra lo
-- contrario — cada índice cubre exactamente la mitad que consulta.
create index idx_nodes_not_archived on public.nodes (workspace_id) where archived_at is null;
create index idx_nodes_archived on public.nodes (workspace_id) where archived_at is not null;

-- ============================================================
-- archive_node / unarchive_node: mismo recorrido recursivo que
-- delete_folder_with_contents (0012_folder_delete.sql) — folders/proyectos
-- descendientes vía `parent_id`. Las tareas NO se tocan: cuelgan de
-- `node_memberships.container_id`, no de `parent_id`, así que nunca
-- forman parte de este subárbol — mismo motivo por el que
-- `delete_folder_with_contents` las trata aparte, solo que acá no hace
-- falta: la tarea sigue siendo tarea, lo que deja de listarse es el
-- proyecto/carpeta/espacio contenedor.
-- ============================================================
create function public.archive_node(p_node_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.nodes n
    where n.id = p_node_id and public.is_member_of(n.workspace_id)
  ) then
    raise exception 'No tenés acceso a este nodo';
  end if;

  with recursive subtree as (
    select id from public.nodes where id = p_node_id
    union all
    select n.id from public.nodes n join subtree s on n.parent_id = s.id
  )
  update public.nodes set archived_at = now()
  where id in (select id from subtree) and archived_at is null;
end;
$$;

create function public.unarchive_node(p_node_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.nodes n
    where n.id = p_node_id and public.is_member_of(n.workspace_id)
  ) then
    raise exception 'No tenés acceso a este nodo';
  end if;

  with recursive subtree as (
    select id from public.nodes where id = p_node_id
    union all
    select n.id from public.nodes n join subtree s on n.parent_id = s.id
  )
  update public.nodes set archived_at = null
  where id in (select id from subtree);
end;
$$;

revoke execute on function public.archive_node(uuid) from public, anon;
revoke execute on function public.unarchive_node(uuid) from public, anon;
grant execute on function public.archive_node(uuid) to authenticated;
grant execute on function public.unarchive_node(uuid) to authenticated;
