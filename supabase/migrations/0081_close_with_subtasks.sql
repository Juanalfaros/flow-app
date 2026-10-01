-- 0081_close_with_subtasks.sql — Fase 2 de "Cerrar con subtareas abiertas"
-- (0080 fue la Fase 1: el estado Descartado en sí). Esta migración es el
-- DEFAULT NO INTERACTIVO (R6 de la decisión) — corre siempre, sin
-- importar qué camino cerró la tarea (Select del detalle, board, list,
-- drag-and-drop, acciones masivas, automatizaciones). El diálogo
-- interactivo (cliente, Fase 2 también) resuelve las subtareas "de
-- alguien" ANTES de mandar el cambio de estado del padre — para cuando
-- este trigger corre, esas ya no están abiertas y no encuentra nada que
-- tocar. Cuando nadie respondió el diálogo (bulk/automatización/cierre
-- silencioso desde board), este trigger es la única red de seguridad:
-- ninguna subtarea queda huérfana (abierta pero invisible), que es el
-- modo de falla real que preocupa (ver el "por qué no bloqueamos" de la
-- decisión).
--
-- Clasificación (R2): sin responsable NI fecha propia → "checklist", se
-- completa en cascada silenciosa (el padre completo YA implica que estos
-- fragmentos están completos). Con responsable O fecha propia → "trabajo
-- de alguien", el default no interactivo es DESCARTAR (nunca completar
-- — completar en falso es el único desenlace que corrompe el dato,
-- según la propia decisión).

-- ============================================================
-- 1. Nuevo tipo de notificación: avisarle a quien tenía la subtarea que
--    se cerró (junto con la tarea padre) sin que ella la resolviera.
-- ============================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'assigned', 'status_changed', 'comment', 'mention', 'watched_activity',
    'unblocked', 'due_reminder', 'removed_from_workspace', 'role_changed', 'welcome',
    'subtask_resolved'
  ));

-- ============================================================
-- 2. El trigger — AFTER UPDATE OF status_id, solo dispara al ENTRAR a un
--    estado 'success' que antes no lo era (mismo criterio de "entrando a
--    success" que ya usa set_task_completed_at, 0072).
-- ============================================================
create or replace function public.close_open_subtasks_on_parent_done()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_container_id uuid;
  v_done_status_id uuid;
  v_dropped_status_id uuid;
  v_completed jsonb := '[]'::jsonb;
  v_dropped jsonb := '[]'::jsonb;
  v_subtask record;
begin
  if new.type != 'task' then return new; end if;
  if old.status_id is not distinct from new.status_id then return new; end if;

  if not exists (select 1 from public.statuses where id = new.status_id and status_kind = 'success') then
    return new;
  end if;
  if exists (select 1 from public.statuses where id = old.status_id and status_kind = 'success') then
    return new;
  end if;

  -- Tarea personal (sin proyecto, ver 0015_my_tasks.sql) — sin
  -- node_memberships no hay a qué proyecto pedirle un estado 'dropped', y
  -- las tareas personales tampoco tienen subtareas hoy. No-op seguro.
  select container_id into v_container_id from public.node_memberships where node_id = new.id limit 1;
  if v_container_id is null then return new; end if;

  select id into v_done_status_id from public.statuses
    where project_id = v_container_id and status_kind = 'success' order by position limit 1;
  select id into v_dropped_status_id from public.statuses
    where project_id = v_container_id and status_kind = 'dropped' order by position limit 1;
  if v_done_status_id is null or v_dropped_status_id is null then return new; end if;

  for v_subtask in
    select n.id, n.title, n.status_id, n.assignee_id, n.due_date
    from public.nodes n
    join public.statuses s on s.id = n.status_id
    where n.parent_id = new.id and n.type = 'task' and s.status_kind not in ('success', 'dropped')
  loop
    if v_subtask.assignee_id is null and v_subtask.due_date is null then
      update public.nodes set status_id = v_done_status_id where id = v_subtask.id;
      v_completed := v_completed || jsonb_build_object('id', v_subtask.id, 'title', v_subtask.title);
    else
      update public.nodes set status_id = v_dropped_status_id where id = v_subtask.id;
      v_dropped := v_dropped || jsonb_build_object(
        'id', v_subtask.id, 'title', v_subtask.title, 'previous_status_id', v_subtask.status_id
      );
      -- No avisar si quien cierra el padre es la misma persona que ya
      -- tenía la subtarea — no hace falta notificarse a uno mismo.
      if v_subtask.assignee_id is not null and v_subtask.assignee_id is distinct from auth.uid() then
        insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
        values (
          new.workspace_id, v_subtask.assignee_id, auth.uid(), v_subtask.id, 'subtask_resolved',
          jsonb_build_object('parent_title', new.title, 'subtask_title', v_subtask.title, 'outcome', 'dropped')
        );
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_completed) > 0 or jsonb_array_length(v_dropped) > 0 then
    -- Entrada propia en el historial (R5), aparte del 'task_updated'
    -- genérico que el propio cambio de estado del padre ya deja vía
    -- trg_log_node_activity — esa no distingue "solo cambié el estado" de
    -- "cambié el estado Y de paso resolví 3 subtareas".
    insert into public.activity_log (workspace_id, node_id, actor_id, action, payload)
    values (
      new.workspace_id, new.id, auth.uid(), 'subtasks_closed',
      jsonb_build_object('completed', v_completed, 'dropped', v_dropped)
    );
  end if;

  return new;
end;
$$;

create trigger trg_close_open_subtasks_on_parent_done
  after update of status_id on public.nodes
  for each row execute function public.close_open_subtasks_on_parent_done();

-- ============================================================
-- 3. promote_subtask_to_task — la 3ra opción del diálogo ("Dejarlas
--    abiertas, fuera de esta tarea"). Conserva el status_id actual de la
--    subtarea (ya es un estado abierto, o el diálogo no habría aparecido)
--    — position calculado entre los demás miembros del contenedor que
--    YA comparten ese mismo estado, mismo criterio que
--    useCreateTaskMutation (src/features/tasks/mutations.ts).
-- ============================================================
create or replace function public.promote_subtask_to_task(p_node_id uuid, p_container_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status_id uuid;
  v_position numeric;
begin
  perform public.assert_can_access_node(p_container_id);

  select status_id into v_status_id from public.nodes where id = p_node_id and type = 'task';
  if v_status_id is null then
    raise exception 'nodo % no existe, no es una tarea, o no tiene estado', p_node_id;
  end if;
  if not exists (select 1 from public.statuses where id = v_status_id and project_id = p_container_id) then
    raise exception 'el estado actual de % no pertenece al proyecto %', p_node_id, p_container_id;
  end if;

  select coalesce(max(nm.position), 0) + 1 into v_position
  from public.node_memberships nm
  join public.nodes n on n.id = nm.node_id
  where nm.container_id = p_container_id and n.status_id = v_status_id;

  update public.nodes set parent_id = null where id = p_node_id;
  insert into public.node_memberships (node_id, container_id, position)
  values (p_node_id, p_container_id, v_position)
  on conflict (node_id, container_id) do update set position = excluded.position;
end;
$$;
