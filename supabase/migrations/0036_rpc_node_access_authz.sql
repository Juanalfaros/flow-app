-- 0036_rpc_node_access_authz.sql — cierra el hueco de autorización que
-- 0028–0035 dejaron abierto sin querer: la RLS de LECTURA ya respeta
-- espacios/proyectos privados, pero las 7 RPCs de mutación de nodos
-- (0017_rpc_authz.sql) son `security definer` — corren como owner de las
-- tablas y saltean RLS por completo — y solo verifican `assert_member_of`
-- a nivel de WORKSPACE, nunca acceso al nodo/contenedor puntual.
--
-- Efecto práctico hoy: cualquier miembro del workspace puede crear, mover o
-- borrar tareas dentro de un espacio o proyecto privado al que no tiene
-- acceso, si conoce el uuid del contenedor — un uuid no es secreto, viaja en
-- la URL y en el payload de Realtime (mismo argumento que ya usó 0017 para
-- el hueco original de estas mismas funciones). Es el mismo patrón de bug,
-- reaparecido en el mismo lugar por el mismo motivo: `security definer`
-- necesita su propio chequeo explícito, la RLS no lo cubre gratis.
--
-- Se agrega `assert_can_access_node`, mismo molde que `assert_member_of`
-- (0017) y `assert_admin_of`, y se llama DESPUÉS del assert de workspace
-- existente en cada RPC — no lo reemplaza: seguir siendo miembro del
-- workspace es necesario pero ya no es suficiente cuando el nodo puntual
-- está detrás de una frontera privada.

create or replace function public.assert_can_access_node(p_node_id uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_node_id is null or not public.can_access_node(p_node_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_can_access_node(uuid) from public, anon;
grant execute on function public.assert_can_access_node(uuid) to authenticated;

-- ============================================================
-- 1. create_project_with_defaults — crear DENTRO de un space/folder privado
--    exige acceso a ese contenedor, no solo ser del workspace.
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
  perform public.assert_can_access_node(p_parent_id);

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
-- 2. create_task_node — firma de 13 args (0021/0030). Se valida el
--    container Y, si hay subtarea, también el parent — mismo criterio que
--    ya usa la validación de workspace unas líneas más abajo.
-- ============================================================
create or replace function public.create_task_node(
  p_id uuid, p_container_id uuid, p_title text, p_status_id uuid, p_position numeric,
  p_priority text default 'medium', p_assignee_id uuid default null,
  p_due_date date default null, p_parent_id uuid default null,
  p_start_date date default null, p_is_milestone boolean default false,
  p_start_time time default null, p_due_time time default null
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
  perform public.assert_can_access_node(p_container_id);

  if p_parent_id is not null then
    select workspace_id into v_parent_workspace_id from public.nodes where id = p_parent_id;
    if v_parent_workspace_id is distinct from v_workspace_id then
      raise exception 'No autorizado' using errcode = '42501';
    end if;
    perform public.assert_can_access_node(p_parent_id);
  end if;

  insert into public.nodes (
    id, workspace_id, parent_id, type, title, status_id, priority, assignee_id,
    due_date, start_date, is_milestone, start_time, due_time, created_by
  )
  values (
    p_id, v_workspace_id, p_parent_id, 'task', p_title, p_status_id, p_priority, p_assignee_id,
    p_due_date, p_start_date, p_is_milestone, p_start_time, p_due_time, auth.uid()
  );

  if p_parent_id is null then
    insert into public.node_memberships (node_id, container_id, position)
    values (p_id, p_container_id, p_position);
  end if;

  return p_id;
end;
$$;

-- ============================================================
-- 3. move_task_node — se validan los DOS extremos, mismo motivo que ya
--    documentaba 0017 para el workspace: con uno solo, se podría exfiltrar
--    una tarea de un container privado, o colarle una a uno ajeno.
-- ============================================================
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
  perform public.assert_can_access_node(p_node_id);

  select workspace_id into v_container_workspace_id from public.nodes where id = p_container_id;
  perform public.assert_member_of(v_container_workspace_id);
  perform public.assert_can_access_node(p_container_id);

  update public.nodes set status_id = p_status_id where id = p_node_id;
  update public.node_memberships set position = p_position
  where node_id = p_node_id and container_id = p_container_id;
end;
$$;

-- ============================================================
-- 4. move_project_tasks
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
  perform public.assert_can_access_node(p_from_project_id);

  select workspace_id into v_to_workspace_id from public.nodes where id = p_to_project_id;
  perform public.assert_member_of(v_to_workspace_id);
  perform public.assert_can_access_node(p_to_project_id);

  update public.nodes n set status_id = p_to_status_id
  where n.id in (select node_id from public.node_memberships where container_id = p_from_project_id);

  update public.node_memberships
  set container_id = p_to_project_id
  where container_id = p_from_project_id;
end;
$$;

-- ============================================================
-- 5. delete_project_with_tasks
-- ============================================================
create or replace function public.delete_project_with_tasks(p_project_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_project_id;
  perform public.assert_member_of(v_workspace_id);
  perform public.assert_can_access_node(p_project_id);

  delete from public.nodes
  where id in (select node_id from public.node_memberships where container_id = p_project_id);
  delete from public.nodes where id = p_project_id;
end;
$$;

-- ============================================================
-- 6. delete_folder_with_contents
-- ============================================================
-- Se valida acceso a la carpeta raíz del borrado, no a cada nodo del
-- subárbol individualmente: si un proyecto ahí adentro está marcado privado
-- POR SU CUENTA (frontera más específica que la carpeta), borrar la carpeta
-- se lo lleva puesto igual. Es una limitación conocida, aceptada porque
-- borrar ya es una operación destructiva de "cualquier miembro" (ver nota
-- original en 0017) — no de admin — así que no se le pide más precisión de
-- la que ya tenía.
create or replace function public.delete_folder_with_contents(p_folder_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_folder_id;
  perform public.assert_member_of(v_workspace_id);
  perform public.assert_can_access_node(p_folder_id);

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
-- 7. rebalance_positions
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
  perform public.assert_can_access_node(p_container_id);

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

-- ============================================================
-- 8. Nota de despliegue
-- ============================================================
-- Para un miembro con rol amplio (owner/admin/member), nada cambia hoy:
-- ningún proyecto está marcado privado todavía (0034/0035), así que en todo
-- nodo con `acl_boundary_id is null` `can_access_node` cae exactamente a lo
-- que `assert_member_of` ya exigía.
--
-- Para un rol `restricted`/`guest` SÍ hay cambio de comportamiento, y es
-- intencional: hasta esta migración podían escribir (crear/mover/borrar
-- tareas) en cualquier parte del workspace aunque no pudieran VER esos
-- mismos espacios por RLS — la mitad "lectura" de 0031 restringía de verdad,
-- la mitad "escritura" no. Si nadie tiene esos roles asignados en el
-- proyecto real todavía, el efecto práctico de este párrafo es cero por
-- ahora; el día que alguien los tenga, sus escrituras quedan tan
-- restringidas como sus lecturas, que es la intención original de 0031.
