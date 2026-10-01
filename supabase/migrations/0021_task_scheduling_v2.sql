-- 0021_task_scheduling_v2.sql — hora del día (start_time/due_time, solo
-- display, no afecta el bucketing por día de Calendar/Gantt) + tareas
-- recurrentes (task_recurrences + generación de la siguiente ocurrencia
-- al completar la actual). Ver PLAN.md / plan de sesión para el contexto
-- completo de por qué la recurrencia vive en un trigger sobre
-- activity_log en vez de en el cliente.

-- ============================================================
-- 1. nodes: start_time / due_time
-- ============================================================
alter table public.nodes add column start_time time;
alter table public.nodes add column due_time time;

-- ============================================================
-- 2. task_recurrences
-- ============================================================
-- Mismo patrón que task_dependencies (0011): sin RPC de escritura, el
-- cliente inserta/borra directo y la validación vive en `with check`.
-- `node_id unique`: como máximo una fila "abierta" por serie — al
-- completar una ocurrencia, el trigger de abajo borra esta fila y crea
-- una nueva apuntando al clon.
create table public.task_recurrences (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null unique references public.nodes(id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval int not null default 1 check (interval > 0),
  days_of_week int[],
  ends_on date,
  occurrences_left int check (occurrences_left is null or occurrences_left > 0),
  created_at timestamptz not null default now()
);

create index idx_task_recurrences_node_id on public.task_recurrences(node_id);

alter table public.task_recurrences enable row level security;

create policy "task_recurrences_all_member" on public.task_recurrences
  for all to authenticated
  using (exists (select 1 from public.nodes n where n.id = node_id and public.is_member_of(n.workspace_id)))
  with check (exists (select 1 from public.nodes n where n.id = node_id and public.is_member_of(n.workspace_id)));

-- ============================================================
-- 3. create_task_node: sumar p_start_time/p_due_time
-- ============================================================
-- Igual que en 0011: agregar parámetros al final cambia la identidad de
-- la función (11 args -> 13), así que hay que dropear la versión vieja
-- antes de crear la nueva.
drop function public.create_task_node(uuid, uuid, text, uuid, numeric, text, uuid, date, uuid, date, boolean);

create function public.create_task_node(
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
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_container_id and type = 'project';
  if v_workspace_id is null then
    raise exception 'container % no existe o no es de tipo project', p_container_id;
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

grant execute on function public.create_task_node(uuid, uuid, text, uuid, numeric, text, uuid, date, uuid, date, boolean, time, time) to authenticated;

-- ============================================================
-- 4. generate_recurrence_on_completion — tercer consumidor de
--    activity_log (junto a log_node_activity que lo produce y
--    notify_from_activity que también lo consume, 0016). Lee el
--    before/after ya calculado en vez de recomputar el diff.
-- ============================================================
-- Por qué un trigger y no lógica en el cliente: hay al menos 6 caminos
-- distintos donde el cliente cambia status_id (drag del board, TaskRow,
-- el select de NodeDetailContent, SubtaskList, la mutación bulk) — un
-- trigger a nivel de base de datos es el único lugar que los cubre a
-- todos sin duplicar esta lógica en cada uno.
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
  -- Solo dispara al ENTRAR a un status "hecha" (evita regenerar en cada
  -- edición posterior de una tarea que ya estaba done->done, y evita
  -- disparar al salir de done).
  if v_after_kind is distinct from 'success' or v_before_kind is not distinct from 'success' then return new; end if;

  select * into v_rec from public.task_recurrences where node_id = new.node_id;
  if not found then return new; end if;

  if v_after->>'due_date' is null then return new; end if; -- sin fecha, no hay ancla para desplazar

  v_shift := case v_rec.frequency
    when 'daily' then (v_rec.interval || ' days')::interval
    when 'weekly' then (v_rec.interval * 7 || ' days')::interval
    when 'monthly' then (v_rec.interval || ' months')::interval
    when 'yearly' then (v_rec.interval || ' years')::interval
  end;
  v_new_due := ((v_after->>'due_date')::date + v_shift)::date;
  v_new_start := case when v_after->>'start_date' is null then null
                 else ((v_after->>'start_date')::date + v_shift)::date end;

  -- Chequeo de fin de serie sobre la PRÓXIMA fecha, no la actual: la
  -- ocurrencia justo en ends_on todavía debe generarse; la siguiente no.
  if (v_rec.ends_on is not null and v_new_due > v_rec.ends_on)
     or (v_rec.occurrences_left is not null and v_rec.occurrences_left <= 1) then
    delete from public.task_recurrences where id = v_rec.id;
    return new;
  end if;

  select container_id into v_container_id from public.node_memberships where node_id = new.node_id;
  if v_container_id is null then return new; end if; -- v1: solo tareas de primer nivel recurren (subtareas no tienen node_memberships)

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

  delete from public.task_recurrences where id = v_rec.id;
  insert into public.task_recurrences (node_id, frequency, interval, days_of_week, ends_on, occurrences_left)
  values (
    v_new_id, v_rec.frequency, v_rec.interval, v_rec.days_of_week, v_rec.ends_on,
    case when v_rec.occurrences_left is null then null else v_rec.occurrences_left - 1 end
  );

  return new;
end;
$$;

create trigger trg_generate_recurrence_on_completion
  after insert on public.activity_log
  for each row execute function public.generate_recurrence_on_completion();
