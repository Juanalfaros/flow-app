-- 0030_restore_create_task_node_authz.sql — restaura el chequeo de membresía
-- en `create_task_node`, perdido al recrear la función en 0021.
--
-- ============================================================
-- Cómo se perdió
-- ============================================================
-- 0017_rpc_authz.sql agregó `assert_member_of` a las 7 RPCs mutantes y revocó
-- su EXECUTE a PUBLIC. Después, 0021_task_scheduling_v2.sql sumó
-- `start_time`/`due_time` a `create_task_node`; como en Postgres agregar
-- parámetros cambia la identidad de la función, hubo que dropear la de 11 args
-- y crear una de 13 — y el cuerpo nuevo se copió de la versión ANTERIOR a
-- 0017. Con eso volvieron los dos agujeros que 0017 había cerrado:
--
--   * sin `assert_member_of`: la función es security definer, o sea que corre
--     como owner de las tablas y saltea RLS. Cualquier usuario autenticado
--     podía volver a crear tareas en un proyecto de otro workspace conociendo
--     solo su uuid.
--   * el `grant ... to authenticated` de 0021 no vino con el `revoke ... from
--     public`, y Postgres concede EXECUTE a PUBLIC por defecto en toda función
--     nueva: `anon` podía llamarla.
--
-- No es un descuido de esa migración en particular: es lo que pasa cada vez que
-- se recrea una función `security definer`. Por eso el chequeo va en el cuerpo
-- y no en un wrapper — cualquiera que copie esta versión se lleva el assert.

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

  -- El padre también se valida: sin esto, un miembro de W1 podría colgar una
  -- subtarea de una tarea de W2 pasando un container propio y un parent ajeno,
  -- y el nodo quedaría con workspace_id de W1 pero visible en el árbol de W2.
  if p_parent_id is not null then
    select workspace_id into v_parent_workspace_id from public.nodes where id = p_parent_id;
    if v_parent_workspace_id is distinct from v_workspace_id then
      raise exception 'No autorizado' using errcode = '42501';
    end if;
  end if;

  insert into public.nodes (
    id, workspace_id, parent_id, type, title, status_id, priority, assignee_id,
    due_date, start_date, is_milestone, start_time, due_time, created_by
  )
  values (
    p_id, v_workspace_id, p_parent_id, 'task', p_title, p_status_id, p_priority, p_assignee_id,
    p_due_date, p_start_date, p_is_milestone, p_start_time, p_due_time, auth.uid()
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

revoke execute on function public.create_task_node(
  uuid, uuid, text, uuid, numeric, text, uuid, date, uuid, date, boolean, time, time
) from public, anon;
grant execute on function public.create_task_node(
  uuid, uuid, text, uuid, numeric, text, uuid, date, uuid, date, boolean, time, time
) to authenticated;
