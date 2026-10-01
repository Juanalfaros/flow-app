-- 0045_dependency_gate.sql — las dependencias del Gantt (task_dependencies,
-- 0011_task_scheduling.sql) pasan de ser puramente decorativas (solo
-- dibujan la flecha) a bloquear de verdad: una tarea no puede completarse
-- mientras tenga una predecesora sin terminar. Decisión ya cerrada con el
-- usuario: bloqueo ESTRICTO, no un aviso que se pueda ignorar.
--
-- Se implementa como UN trigger `before update of status_id on nodes`, no
-- tocando cada mutación del cliente por separado: los 4 caminos que hoy
-- cambian `status_id` (moveTask -> RPC move_task_node; updateTaskFields ->
-- update directo, usado por el <Select> de estado y por toggleDone() en
-- TaskCard/TaskRow/NodeDetailContent; useUpdateSubtaskStatusMutation;
-- useBulkUpdateTasksMutation) terminan en el mismo
-- `update nodes set status_id = ...` — un trigger BEFORE UPDATE los cubre
-- a todos de una sola vez, sin duplicar el chequeo en cada mutación.
--
-- Caveat conocido: `move_project_tasks` (RPC de fusión/borrado de
-- proyecto) hace un update multi-fila sobre `nodes`. El trigger dispara
-- por fila ahí también — si el estado destino es de severidad `success` y
-- CUALQUIER tarea movida tiene dependencias sin cumplir, TODA la
-- operación aborta (una sola transacción). Se acepta: es una acción rara,
-- de administración.

create function public.has_unmet_dependencies(p_node_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.task_dependencies td
    join public.nodes pn on pn.id = td.predecessor_id
    left join public.statuses ps on ps.id = pn.status_id
    where td.successor_id = p_node_id and coalesce(ps.status_kind, '') != 'success'
  );
$$;

grant execute on function public.has_unmet_dependencies(uuid) to authenticated;

create function public.enforce_dependency_gate()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_new_kind text;
  v_old_kind text;
begin
  if new.type != 'task' then return new; end if;
  select status_kind into v_new_kind from public.statuses where id = new.status_id;
  select status_kind into v_old_kind from public.statuses where id = old.status_id;
  if v_new_kind = 'success' and v_old_kind is distinct from 'success'
     and public.has_unmet_dependencies(new.id) then
    raise exception 'No se puede completar: tiene tareas predecesoras sin terminar'
      using errcode = 'GY001';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_dependency_gate
  before update of status_id on public.nodes
  for each row execute function public.enforce_dependency_gate();

-- Notifica a los responsables de la SUCESORA cuando la última predecesora
-- que le faltaba se completa (has_unmet_dependencies pasa de true a
-- false) — "ya puedes empezar".
create function public.notify_on_dependency_unblocked()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_new_kind text;
  v_old_kind text;
  v_succ_id uuid;
  v_recipient uuid;
begin
  if new.type != 'task' then return new; end if;
  select status_kind into v_new_kind from public.statuses where id = new.status_id;
  select status_kind into v_old_kind from public.statuses where id = old.status_id;
  if v_new_kind is distinct from 'success' or v_old_kind is not distinct from 'success' then return new; end if;

  for v_succ_id in select successor_id from public.task_dependencies where predecessor_id = new.id loop
    if not public.has_unmet_dependencies(v_succ_id) then
      for v_recipient in select user_id from public.task_assignees where node_id = v_succ_id loop
        insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
        values (new.workspace_id, v_recipient, auth.uid(), v_succ_id, 'unblocked', '{}'::jsonb);
      end loop;
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_notify_on_dependency_unblocked
  after update of status_id on public.nodes
  for each row execute function public.notify_on_dependency_unblocked();

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned', 'status_changed', 'comment', 'mention', 'watched_activity', 'unblocked'));
