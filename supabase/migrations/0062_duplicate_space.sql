-- 0062_duplicate_space.sql — "Duplicar espacio" (menú de espacio en el
-- sidebar). El clonado multi-nivel más grande del repo: sin precedente de
-- remapeo de ids antes de esto — se apoya en dos patrones ya probados:
--   - el recorrido recursivo por `parent_id` de delete_folder_with_contents
--     (0012/0036) para encontrar folders/proyectos descendientes,
--   - duplicate_task_node (0047) para clonar cada tarea (título,
--     descripción, prioridad, etiquetas, responsables, subtareas de un
--     nivel) — se REUSA tal cual, no se reimplementa esa lógica acá.
--
-- Alcance v1 deliberado: clona estructura (espacio/folders/proyectos,
-- estados, definiciones de campos personalizados) + tareas base. NO clona
-- comentarios/adjuntos/entradas de tiempo/valores de campos personalizados
-- por tarea, ni privacidad/ACL (el espacio nuevo arranca abierto, igual
-- que createSpace/createFolder/create_project_with_defaults) — "duplicar"
-- es una copia fresca para reusar como base de trabajo, no un clon
-- histórico completo (mismo criterio que "Guardar como plantilla", F5).

create function public.duplicate_space(p_space_id uuid, p_new_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_new_space_id uuid := gen_random_uuid();
  v_row record;
  v_new_id uuid;
  v_new_parent_id uuid;
  v_status record;
  v_new_status_id uuid;
  v_field record;
  v_task record;
  v_new_status_for_task uuid;
begin
  select workspace_id into v_workspace_id from public.nodes
  where id = p_space_id and type = 'space';
  if v_workspace_id is null then
    raise exception 'espacio % no existe', p_space_id;
  end if;
  perform public.assert_member_of(v_workspace_id);
  perform public.assert_can_access_node(p_space_id);

  -- Mapeos old_id -> new_id, uno para nodos (space/folder/project) y otro
  -- para statuses (las tareas cloneadas necesitan el status_id del
  -- proyecto NUEVO, no el viejo). `on commit drop`: cada llamada a esta
  -- RPC es su propia transacción (PostgREST), así que quedan vacíos para
  -- la próxima sin limpieza manual.
  create temporary table tmp_node_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temporary table tmp_status_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  insert into public.nodes (id, workspace_id, parent_id, type, title, created_by)
  values (v_new_space_id, v_workspace_id, null, 'space', p_new_name, auth.uid());
  insert into tmp_node_map (old_id, new_id) values (p_space_id, v_new_space_id);

  -- Recorrido en orden de profundidad: un folder/proyecto siempre se
  -- inserta después de su padre, así que tmp_node_map ya tiene el padre
  -- mapeado cuando le toca el turno (mismo motivo por el que `order by
  -- depth` no es opcional acá).
  for v_row in (
    with recursive subtree as (
      select id, parent_id, type, title, 0 as depth from public.nodes where id = p_space_id
      union all
      select n.id, n.parent_id, n.type, n.title, s.depth + 1
      from public.nodes n join subtree s on n.parent_id = s.id
    )
    select * from subtree where id <> p_space_id order by depth
  ) loop
    v_new_id := gen_random_uuid();
    select new_id into v_new_parent_id from tmp_node_map where old_id = v_row.parent_id;

    insert into public.nodes (id, workspace_id, parent_id, type, title, created_by)
    values (v_new_id, v_workspace_id, v_new_parent_id, v_row.type, v_row.title, auth.uid());
    insert into tmp_node_map (old_id, new_id) values (v_row.id, v_new_id);

    if v_row.type = 'project' then
      -- Estados: se clonan uno por uno (no create_project_with_defaults,
      -- que sembraría 3 estados fijos en vez de los del proyecto real).
      for v_status in select * from public.statuses where project_id = v_row.id order by position loop
        v_new_status_id := gen_random_uuid();
        insert into public.statuses (id, project_id, name, status_kind, position, is_default)
        values (v_new_status_id, v_new_id, v_status.name, v_status.status_kind, v_status.position, v_status.is_default);
        insert into tmp_status_map (old_id, new_id) values (v_status.id, v_new_status_id);
      end loop;

      -- Definiciones de campos personalizados (sin valores por tarea, ver
      -- nota de alcance arriba).
      for v_field in select * from public.project_custom_fields where project_id = v_row.id loop
        insert into public.project_custom_fields (project_id, name, field_type, options, position)
        values (v_new_id, v_field.name, v_field.field_type, v_field.options, v_field.position);
      end loop;

      -- Tareas: node_memberships solo tiene tareas de nivel superior (ver
      -- create_task_node, 0036) — duplicate_task_node ya clona sus
      -- subtareas de un nivel, etiquetas, responsables y descripción.
      for v_task in
        select nm.node_id, nm.position, n.status_id
        from public.node_memberships nm
        join public.nodes n on n.id = nm.node_id
        where nm.container_id = v_row.id
      loop
        select new_id into v_new_status_for_task from tmp_status_map where old_id = v_task.status_id;
        perform public.duplicate_task_node(v_task.node_id, v_new_id, v_new_status_for_task, v_task.position);
      end loop;
    end if;
  end loop;

  return v_new_space_id;
end;
$$;

revoke execute on function public.duplicate_space(uuid, text) from public, anon;
grant execute on function public.duplicate_space(uuid, text) to authenticated;
