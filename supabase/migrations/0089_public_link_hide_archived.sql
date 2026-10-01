-- 0089_public_link_hide_archived.sql — Auditoría de seguridad
-- 2026-09-16, hallazgo S6.
--
-- `public_link_view` (0085) no filtraba `archived_at` en ninguna de sus
-- dos ramas de tareas (el listado de un proyecto, y las subtareas de una
-- tarea puntual). El archivado (0061_node_archiving.sql) es una acción
-- deliberada de "sacar esto de circulación" — una tarea archivada seguía
-- apareciendo en el link público que se le mandó a un cliente externo.
--
-- No aplica a `hidden_nodes` (0060): es preferencia de barra lateral por
-- usuario, no un estado del nodo, y correctamente nunca se consulta acá.
create or replace function public.public_link_view(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_node_id uuid;
  v_type text;
  v_result jsonb;
begin
  select pl.node_id, n.type into v_node_id, v_type
    from public.public_links pl join public.nodes n on n.id = pl.node_id
    where pl.token = p_token;

  -- Token inválido o el nodo ya no existe: null sin distinguir el
  -- motivo, mismo criterio que calendar_feed_events (0033) — un 404
  -- explícito confirmaría que el token es válido.
  if v_node_id is null then
    return null;
  end if;

  update public.public_links set last_accessed_at = now() where token = p_token;

  if v_type = 'project' then
    select jsonb_build_object(
      'kind', 'project',
      'title', n.title,
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'status_name', s.name,
          'status_kind', s.status_kind,
          'priority', t.priority,
          'due_date', t.due_date,
          'assignee_name', p.full_name,
          'labels', coalesce((
            select jsonb_agg(jsonb_build_object('name', l.name, 'color', l.color))
            from public.task_labels tl join public.labels l on l.id = tl.label_id
            where tl.node_id = t.id
          ), '[]'::jsonb)
        ) order by nm.position)
        from public.node_memberships nm
        join public.nodes t on t.id = nm.node_id
        left join public.statuses s on s.id = t.status_id
        left join public.profiles p on p.id = t.assignee_id
        where nm.container_id = v_node_id and t.type = 'task' and t.archived_at is null
      ), '[]'::jsonb)
    ) into v_result
    from public.nodes n where n.id = v_node_id;
  else
    select jsonb_build_object(
      'kind', 'task',
      'title', t.title,
      'description', t.description,
      'status_name', s.name,
      'status_kind', s.status_kind,
      'priority', t.priority,
      'due_date', t.due_date,
      'assignee_name', p.full_name,
      'labels', coalesce((
        select jsonb_agg(jsonb_build_object('name', l.name, 'color', l.color))
        from public.task_labels tl join public.labels l on l.id = tl.label_id
        where tl.node_id = t.id
      ), '[]'::jsonb),
      'subtasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', st.id,
          'title', st.title,
          'status_name', ss.name,
          'status_kind', ss.status_kind,
          'priority', st.priority,
          'due_date', st.due_date,
          'assignee_name', sp.full_name
        ))
        from public.nodes st
        left join public.statuses ss on ss.id = st.status_id
        left join public.profiles sp on sp.id = st.assignee_id
        where st.parent_id = v_node_id and st.type = 'task' and st.archived_at is null
      ), '[]'::jsonb)
    ) into v_result
    from public.nodes t
    left join public.statuses s on s.id = t.status_id
    left join public.profiles p on p.id = t.assignee_id
    where t.id = v_node_id;
  end if;

  return v_result;
end;
$$;
