-- 0082_reopen_restore_subtasks.sql — Fase 3 de "Cerrar con subtareas
-- abiertas" (R3): reabrir el padre (salir de un estado 'success') puede
-- ofrecer restaurar las subtareas que la Fase 2 cerró en cascada a como
-- estaban ANTES de esa cascada.
--
-- Para eso hace falta el mismo dato en las dos ramas del trigger: la
-- rama `v_dropped` (0081) ya guardaba `previous_status_id`; la rama
-- `v_completed` no lo hacía (nunca hacía falta reabrir esa mitad). Esta
-- migración solo agrega ese campo faltante, `create or replace` sobre la
-- misma función — nada más cambia (mismo criterio de clasificación,
-- mismo trigger, misma firma).
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
      -- Antes de 0082 esta rama no guardaba `previous_status_id` — R3
      -- (restaurar al reabrir el padre) necesita el mismo dato que ya
      -- tenía la rama `dropped` de abajo.
      v_completed := v_completed || jsonb_build_object(
        'id', v_subtask.id, 'title', v_subtask.title, 'previous_status_id', v_subtask.status_id
      );
    else
      update public.nodes set status_id = v_dropped_status_id where id = v_subtask.id;
      v_dropped := v_dropped || jsonb_build_object(
        'id', v_subtask.id, 'title', v_subtask.title, 'previous_status_id', v_subtask.status_id
      );
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
    insert into public.activity_log (workspace_id, node_id, actor_id, action, payload)
    values (
      new.workspace_id, new.id, auth.uid(), 'subtasks_closed',
      jsonb_build_object('completed', v_completed, 'dropped', v_dropped)
    );
  end if;

  return new;
end;
$$;
