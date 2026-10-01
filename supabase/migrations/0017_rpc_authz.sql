-- 0017_rpc_authz.sql — cierra el bypass de RLS de las RPCs mutantes.
--
-- Contexto del hallazgo: la RLS por tabla (0003_rls.sql, 0008_nodes_engine.sql)
-- está bien construida, pero TODA función `security definer` corre como owner
-- de las tablas, y el owner bypassea RLS (no hay `force row level security` en
-- ninguna tabla de este esquema). Las RPCs de mutación se declararon
-- `security definer` por dos motivos legítimos —atomicidad multi-tabla y
-- resolver `workspace_id` server-side desde el container— pero ninguna
-- chequeaba membresía, así que en la práctica eran un `using (true)` sobre
-- todo el esquema:
--
--   * delete_project_with_tasks(uuid)   -> borrar cualquier proyecto ajeno
--   * delete_folder_with_contents(uuid) -> borrar un subárbol ajeno completo
--   * move_project_tasks(uuid,uuid,uuid)-> vaciar un proyecto ajeno
--   * move_task_node(...)               -> mover/reestadar cualquier tarea
--   * create_task_node(...)             -> insertar en proyectos ajenos
--   * create_project_with_defaults(...) -> crear proyectos en spaces ajenos
--   * rebalance_positions(uuid)         -> reescribir posiciones ajenas
--
-- Un uuid no es un secreto (viaja en la URL, en enlaces compartidos, en el
-- payload de realtime), así que "no lo van a adivinar" no es una defensa.
--
-- Esta migración NO revierte el `security definer` (se sigue necesitando por
-- atomicidad); restablece la intención original agregando el chequeo explícito
-- que la RLS ya no puede aplicar por sí sola.

-- ============================================================
-- 1. Asserts reutilizables
-- ============================================================
-- Envuelven is_member_of/is_admin_of (0003_rls.sql) para no repetir el
-- `if not ... then raise` en cada RPC. errcode 42501 = insufficient_privilege:
-- PostgREST lo mapea a HTTP 403, no a 500, así que el cliente distingue
-- "no autorizado" de "se rompió algo" sin parsear el mensaje.
--
-- `p_workspace_id is null` cuenta como no autorizado a propósito: las RPCs lo
-- resuelven con un `select ... into` que deja null cuando el nodo no existe,
-- y esa rama tiene que denegar igual (si no, un uuid inexistente saltearía
-- el chequeo). Además, `not null` de un `is_member_of(null)` daría null, no
-- false — el `if not null` no entra al then y dejaría pasar todo.

create or replace function public.assert_member_of(p_workspace_id uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_workspace_id is null or not public.is_member_of(p_workspace_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_admin_of(p_workspace_id uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_workspace_id is null or not public.is_admin_of(p_workspace_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.assert_member_of(uuid) to authenticated;
grant execute on function public.assert_admin_of(uuid) to authenticated;

-- ============================================================
-- 2. create_project_with_defaults — firma de 0012_folder_delete.sql
-- ============================================================
create or replace function public.create_project_with_defaults(p_parent_id uuid, p_name text)
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
  perform public.assert_member_of(v_workspace_id);

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

-- ============================================================
-- 3. create_task_node — firma de 11 args (0011_task_scheduling.sql)
-- ============================================================
-- Además del container, se valida `p_parent_id` (subtarea): sin eso, un
-- miembro de W1 podría colgar una subtarea de una tarea de W2 pasando un
-- container propio y un parent ajeno — el nodo quedaría con el workspace_id
-- de W1 pero visible en el árbol de W2.
create or replace function public.create_task_node(
  p_id uuid, p_container_id uuid, p_title text, p_status_id uuid, p_position numeric,
  p_priority text default 'medium', p_assignee_id uuid default null,
  p_due_date date default null, p_parent_id uuid default null,
  p_start_date date default null, p_is_milestone boolean default false
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_parent_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_container_id and type = 'project';
  if v_workspace_id is null then
    raise exception 'container % no existe o no es de tipo project', p_container_id;
  end if;
  perform public.assert_member_of(v_workspace_id);

  if p_parent_id is not null then
    select workspace_id into v_parent_workspace_id from public.nodes where id = p_parent_id;
    if v_parent_workspace_id is distinct from v_workspace_id then
      raise exception 'No autorizado' using errcode = '42501';
    end if;
  end if;

  insert into public.nodes (
    id, workspace_id, parent_id, type, title, status_id, priority, assignee_id,
    due_date, start_date, is_milestone, created_by
  )
  values (
    p_id, v_workspace_id, p_parent_id, 'task', p_title, p_status_id, p_priority, p_assignee_id,
    p_due_date, p_start_date, p_is_milestone, auth.uid()
  );

  -- Subtareas (p_parent_id no nulo) no reciben fila en node_memberships,
  -- ver 4.2 del PLAN.md.
  if p_parent_id is null then
    insert into public.node_memberships (node_id, container_id, position)
    values (p_id, p_container_id, p_position);
  end if;

  return p_id;
end;
$$;

-- ============================================================
-- 4. move_task_node
-- ============================================================
-- Se validan los DOS extremos: el nodo que se mueve y el container destino.
-- Con solo uno, un miembro de W1 podría mover una tarea de W2 a su propio
-- tablero (o al revés, exfiltrar una tarea propia a un container ajeno).
create or replace function public.move_task_node(
  p_node_id uuid, p_container_id uuid, p_status_id uuid, p_position numeric
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_node_workspace_id uuid;
  v_container_workspace_id uuid;
begin
  select workspace_id into v_node_workspace_id from public.nodes where id = p_node_id;
  perform public.assert_member_of(v_node_workspace_id);

  select workspace_id into v_container_workspace_id from public.nodes where id = p_container_id;
  perform public.assert_member_of(v_container_workspace_id);

  update public.nodes set status_id = p_status_id where id = p_node_id;
  update public.node_memberships set position = p_position
  where node_id = p_node_id and container_id = p_container_id;
end;
$$;

-- ============================================================
-- 5. move_project_tasks
-- ============================================================
create or replace function public.move_project_tasks(
  p_from_project_id uuid, p_to_project_id uuid, p_to_status_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_from_workspace_id uuid;
  v_to_workspace_id uuid;
begin
  select workspace_id into v_from_workspace_id from public.nodes where id = p_from_project_id;
  perform public.assert_member_of(v_from_workspace_id);

  select workspace_id into v_to_workspace_id from public.nodes where id = p_to_project_id;
  perform public.assert_member_of(v_to_workspace_id);

  update public.nodes n set status_id = p_to_status_id
  where n.id in (select node_id from public.node_memberships where container_id = p_from_project_id);

  update public.node_memberships
  set container_id = p_to_project_id
  where container_id = p_from_project_id;
end;
$$;

-- ============================================================
-- 6. delete_project_with_tasks
-- ============================================================
-- Miembro, no admin: `projects_delete_admin` (0003) exigía admin para borrar
-- un proyecto, pero esa policy murió con la tabla `projects` en 0009 —
-- `nodes_all_member` (0008 §11) es la que rige hoy y permite el delete a
-- cualquier miembro. Se replica ESE nivel para no cambiar de golpe quién
-- puede borrar proyectos, que es una decisión de producto aparte; el punto
-- de esta migración es que sea miembro del workspace correcto.
create or replace function public.delete_project_with_tasks(p_project_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_project_id;
  perform public.assert_member_of(v_workspace_id);

  delete from public.nodes
  where id in (select node_id from public.node_memberships where container_id = p_project_id);
  -- delete del propio project cascadea node_memberships (container_id FK)
  -- y statuses (statuses.project_id FK on delete cascade, sin cambios).
  delete from public.nodes where id = p_project_id;
end;
$$;

-- ============================================================
-- 7. delete_folder_with_contents (0012_folder_delete.sql)
-- ============================================================
create or replace function public.delete_folder_with_contents(p_folder_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_folder_id;
  perform public.assert_member_of(v_workspace_id);

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

  delete from public.nodes where id = p_folder_id;
end;
$$;

-- ============================================================
-- 8. rebalance_positions
-- ============================================================
create or replace function public.rebalance_positions(p_container_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_container_id;
  perform public.assert_member_of(v_workspace_id);

  with ranked as (
    select nm.node_id, nm.container_id, n.status_id,
           row_number() over (partition by n.status_id order by nm.position) as rn
    from public.node_memberships nm
    join public.nodes n on n.id = nm.node_id
    where nm.container_id = p_container_id
  )
  update public.node_memberships nm
  set position = ranked.rn * 1000
  from ranked
  where nm.node_id = ranked.node_id and nm.container_id = ranked.container_id;
end;
$$;
