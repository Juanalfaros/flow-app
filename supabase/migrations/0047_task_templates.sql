-- 0047_task_templates.sql — duplicar una tarea (con sus subtareas de un
-- nivel, etiquetas y responsables). No hay código de clonado en el repo
-- hasta ahora — esto calca el patrón que ya prueba
-- generate_recurrence_on_completion (0021/0044): crear el nodo vía
-- create_task_node, copiar description, copiar task_labels y
-- task_assignees por insert-select.
--
-- Entrega "duplicar una tarea existente" (lo que pide la propuesta). Una
-- librería de plantillas con nombre, independiente de cualquier tarea
-- existente, es un esquema más grande (task_templates desacoplada de
-- nodes) y queda fuera de este alcance.
create function public.duplicate_task_node(
  p_source_id uuid, p_container_id uuid, p_status_id uuid, p_position numeric
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_src public.nodes%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_sub public.nodes%rowtype;
  v_new_sub_id uuid;
begin
  select * into v_src from public.nodes where id = p_source_id and type = 'task';
  if not found then
    raise exception 'tarea % no existe', p_source_id;
  end if;
  perform public.assert_can_access_node(p_source_id);
  perform public.assert_can_access_node(p_container_id);

  perform public.create_task_node(
    v_new_id, p_container_id, v_src.title || ' (copia)', p_status_id, p_position,
    v_src.priority, null, v_src.due_date, null, v_src.start_date, v_src.is_milestone,
    v_src.start_time, v_src.due_time
  );
  update public.nodes set description = v_src.description where id = v_new_id;
  insert into public.task_labels (node_id, label_id)
    select v_new_id, label_id from public.task_labels where node_id = p_source_id;
  -- p_assignee_id null arriba (a propósito, mismo motivo que el resto de
  -- esta migración: no queremos que la copia herede el mismo assignee_id
  -- server-side dos veces) — el insert de abajo es la única fuente y
  -- dispara el sync de 0041 para fijar el principal del nodo NUEVO.
  insert into public.task_assignees (node_id, user_id, assigned_by)
    select v_new_id, user_id, auth.uid() from public.task_assignees where node_id = p_source_id;

  -- Un nivel de subtareas, igual límite que el resto del esquema
  -- (create_task_node ya no permite anidar más de un nivel).
  for v_sub in select * from public.nodes where parent_id = p_source_id and type = 'task' loop
    v_new_sub_id := gen_random_uuid();
    perform public.create_task_node(
      v_new_sub_id, p_container_id, v_sub.title, p_status_id, 0,
      v_sub.priority, null, v_sub.due_date, v_new_id, null, false, null, null
    );
    update public.nodes set description = v_sub.description where id = v_new_sub_id;
    insert into public.task_labels (node_id, label_id)
      select v_new_sub_id, label_id from public.task_labels where node_id = v_sub.id;
    insert into public.task_assignees (node_id, user_id, assigned_by)
      select v_new_sub_id, user_id, auth.uid() from public.task_assignees where node_id = v_sub.id;
  end loop;

  return v_new_id;
end;
$$;

grant execute on function public.duplicate_task_node(uuid, uuid, uuid, numeric) to authenticated;
