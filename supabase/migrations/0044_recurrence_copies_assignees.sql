-- 0044_recurrence_copies_assignees.sql — la siguiente ocurrencia de una
-- tarea recurrente copia también task_assignees (0041), no solo el
-- assignee_id escalar del principal.
--
-- generate_recurrence_on_completion() (0021_task_scheduling_v2.sql) ya
-- copia task_labels con un insert-select justo después de crear el nodo
-- nuevo — esto agrega la misma línea para task_assignees, mismo lugar.
-- `create_task_node` sigue recibiendo `(v_after->>'assignee_id')::uuid`
-- como antes (dispara el sync de 0041 para el principal); el
-- insert-select de acá es adicional y no-op seguro para ese mismo user_id
-- (el `on conflict do nothing` de `task_assignees` en 0041 no aplica acá
-- porque este insert no lo declara — se agrega explícito para no fallar
-- si create_task_node ya insertó esa misma fila).
create or replace function public.generate_recurrence_on_completion()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_before_kind text;
  v_after_kind text;
  v_rec public.task_recurrences%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_container_id uuid;
  v_status_id uuid;
  v_position numeric;
  v_new_start date;
  v_new_due date;
  v_shift interval;
begin
  if new.action <> 'task_updated' then return new; end if;
  v_before := new.payload->'before';
  v_after := new.payload->'after';
  if (v_before->>'status_id') is not distinct from (v_after->>'status_id') then return new; end if;

  select status_kind into v_before_kind from public.statuses where id = (v_before->>'status_id')::uuid;
  select status_kind into v_after_kind from public.statuses where id = (v_after->>'status_id')::uuid;
  if v_after_kind is distinct from 'success' or v_before_kind is not distinct from 'success' then return new; end if;

  select * into v_rec from public.task_recurrences where node_id = new.node_id;
  if not found then return new; end if;

  if v_after->>'due_date' is null then return new; end if;

  v_shift := case v_rec.frequency
    when 'daily' then (v_rec.interval || ' days')::interval
    when 'weekly' then (v_rec.interval * 7 || ' days')::interval
    when 'monthly' then (v_rec.interval || ' months')::interval
    when 'yearly' then (v_rec.interval || ' years')::interval
  end;
  v_new_due := ((v_after->>'due_date')::date + v_shift)::date;
  v_new_start := case when v_after->>'start_date' is null then null
                 else ((v_after->>'start_date')::date + v_shift)::date end;

  if (v_rec.ends_on is not null and v_new_due > v_rec.ends_on)
     or (v_rec.occurrences_left is not null and v_rec.occurrences_left <= 1) then
    delete from public.task_recurrences where id = v_rec.id;
    return new;
  end if;

  select container_id into v_container_id from public.node_memberships where node_id = new.node_id;
  if v_container_id is null then return new; end if;

  select id into v_status_id from public.statuses where project_id = v_container_id and is_default limit 1;
  if v_status_id is null then
    select id into v_status_id from public.statuses where project_id = v_container_id order by position limit 1;
  end if;
  if v_status_id is null then return new; end if;

  select coalesce(max(nm.position), 0) + 1000 into v_position
    from public.node_memberships nm
    join public.nodes n on n.id = nm.node_id
    where nm.container_id = v_container_id and n.status_id = v_status_id;

  perform public.create_task_node(
    v_new_id, v_container_id, v_after->>'title', v_status_id, v_position,
    v_after->>'priority', (v_after->>'assignee_id')::uuid,
    v_new_due, null, v_new_start, (v_after->>'is_milestone')::boolean,
    (v_after->>'start_time')::time, (v_after->>'due_time')::time
  );
  update public.nodes set description = v_after->>'description' where id = v_new_id;
  insert into public.task_labels (node_id, label_id)
    select v_new_id, label_id from public.task_labels where node_id = new.node_id;
  -- Nuevo: copia todos los responsables (no solo el principal, que ya
  -- llega vía create_task_node de arriba).
  insert into public.task_assignees (node_id, user_id, assigned_by)
    select v_new_id, user_id, assigned_by from public.task_assignees where node_id = new.node_id
    on conflict (node_id, user_id) do nothing;

  delete from public.task_recurrences where id = v_rec.id;
  insert into public.task_recurrences (node_id, frequency, interval, days_of_week, ends_on, occurrences_left)
  values (
    v_new_id, v_rec.frequency, v_rec.interval, v_rec.days_of_week, v_rec.ends_on,
    case when v_rec.occurrences_left is null then null else v_rec.occurrences_left - 1 end
  );

  return new;
end;
$$;
