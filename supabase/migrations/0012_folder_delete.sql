-- 0012_folder_delete.sql — habilita `folder` como padre real de proyectos
-- (jerarquía anidada arbitraria: space > folder > folder > ... > project) y
-- agrega el RPC de borrado recursivo que le falta a `folder` (ver PLAN.md
-- §4.1/§4.2/§4.4). Sin cambios de RLS: `nodes_all_member` ya es genérica por
-- `workspace_id`, no por `type` (0008_nodes_engine.sql §11).

-- ============================================================
-- 1. create_project_with_defaults: acepta cualquier padre space/folder,
--    no solo space. Postgres no permite renombrar un parámetro vía
--    CREATE OR REPLACE FUNCTION (error 42P13, mismo caso ya resuelto para
--    rebalance_positions en 0008_nodes_engine.sql) — hay que dropear la
--    firma vieja primero.
-- ============================================================
drop function public.create_project_with_defaults(uuid, text);

create function public.create_project_with_defaults(p_parent_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_project_id uuid;
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes
  where id = p_parent_id and type in ('space', 'folder');
  if v_workspace_id is null then
    raise exception 'parent % no existe o no es de tipo space/folder', p_parent_id;
  end if;

  insert into public.nodes (workspace_id, parent_id, type, title, created_by)
  values (v_workspace_id, p_parent_id, 'project', p_name, auth.uid())
  returning id into v_project_id;

  insert into public.statuses (project_id, name, status_kind, position, is_default)
  values
    (v_project_id, 'Por hacer',   'neutral', 0, true),
    (v_project_id, 'En progreso', 'neutral', 1, false),
    (v_project_id, 'Hecho',       'success', 2, false);

  return v_project_id;
end;
$$;

grant execute on function public.create_project_with_defaults(uuid, text) to authenticated;

-- ============================================================
-- 2. delete_folder_with_contents: borra un folder y todo su subárbol
--    (folders/projects/statuses hijos cascadean solos vía `parent_id on
--    delete cascade`), pero primero hay que borrar a mano las tareas de
--    cada project descendiente — viven en `node_memberships`, no bajo
--    `parent_id`, así que la cascada de arriba NO las alcanza y quedarían
--    huérfanas (mismo gotcha que resuelve `delete_project_with_tasks` para
--    un solo proyecto, ver PLAN.md §4.2/§4.4).
-- ============================================================
create function public.delete_folder_with_contents(p_folder_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  with recursive subtree as (
    select id, type from public.nodes where id = p_folder_id
    union all
    select n.id, n.type from public.nodes n
    join subtree s on n.parent_id = s.id
  )
  delete from public.nodes
  where id in (
    select nm.node_id from public.node_memberships nm
    where nm.container_id in (select id from subtree where type = 'project')
  );

  -- borra el folder: la cascada de `parent_id on delete cascade` se
  -- encarga de folders/projects hijos, de `statuses` (via `project_id`
  -- cascade) y de `node_memberships` (via `container_id`/`node_id` cascade).
  delete from public.nodes where id = p_folder_id;
end;
$$;

grant execute on function public.delete_folder_with_contents(uuid) to authenticated;
