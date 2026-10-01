-- 0011_task_scheduling.sql — start_date/is_milestone + dependencias entre
-- tareas, base para la vista Gantt (F5, ver PLAN.md).

-- ============================================================
-- 1. nodes: start_date / is_milestone
-- ============================================================
alter table public.nodes add column start_date date;
alter table public.nodes add column is_milestone boolean not null default false;

alter table public.nodes add constraint nodes_start_before_due
  check (start_date is null or due_date is null or start_date <= due_date);

-- ============================================================
-- 2. task_dependencies
-- ============================================================
create table public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  predecessor_id uuid not null references public.nodes(id) on delete cascade,
  successor_id uuid not null references public.nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create index idx_task_dependencies_predecessor on public.task_dependencies(predecessor_id);
create index idx_task_dependencies_successor on public.task_dependencies(successor_id);

-- Recorre la cadena de dependencias hacia adelante desde `p_successor_id`
-- (sus sucesores, y los sucesores de esos, etc.) — si `p_predecessor_id`
-- aparece en ese recorrido, agregar predecessor_id->successor_id cerraría
-- un ciclo. Sin precedente de chequeo de ciclos en el repo (ni siquiera
-- para nodes.parent_id) — capacidad nueva.
create or replace function public.would_create_cycle(p_predecessor_id uuid, p_successor_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive downstream as (
    select successor_id as node_id from public.task_dependencies where predecessor_id = p_successor_id
    union
    select td.successor_id from public.task_dependencies td join downstream d on td.predecessor_id = d.node_id
  )
  select exists (select 1 from downstream where node_id = p_predecessor_id);
$$;

alter table public.task_dependencies enable row level security;

-- Sin RPC de escritura (a diferencia de node_memberships): acá no hay
-- riesgo de divergencia posición/estado que proteger, así que el cliente
-- inserta/borra directo y la validación (mismo workspace + sin ciclo)
-- vive en el `with check`, igual que el resto de las tablas auxiliares
-- (task_labels, comments).
create policy "task_dependencies_all_member" on public.task_dependencies
  for all to authenticated
  using (
    exists (select 1 from public.nodes n where n.id = predecessor_id and public.is_member_of(n.workspace_id))
    and exists (select 1 from public.nodes n where n.id = successor_id and public.is_member_of(n.workspace_id))
  )
  with check (
    predecessor_id <> successor_id
    and exists (select 1 from public.nodes n where n.id = predecessor_id and public.is_member_of(n.workspace_id))
    and exists (select 1 from public.nodes n where n.id = successor_id and public.is_member_of(n.workspace_id))
    and not public.would_create_cycle(predecessor_id, successor_id)
  );

-- ============================================================
-- 3. create_task_node: sumar p_start_date/p_is_milestone
-- ============================================================
-- `create or replace` no alcanza acá: agregar parámetros al final cambia
-- el tipo de firma (9 args -> 11), así que Postgres lo trataría como un
-- overload nuevo en vez de reemplazar el existente — quedarían las dos
-- versiones y una llamada con 9 args positional se volvería ambigua. Se
-- dropea la versión vieja primero.
drop function public.create_task_node(uuid, uuid, text, uuid, numeric, text, uuid, date, uuid);

create function public.create_task_node(
  p_id uuid, p_container_id uuid, p_title text, p_status_id uuid, p_position numeric,
  p_priority text default 'medium', p_assignee_id uuid default null,
  p_due_date date default null, p_parent_id uuid default null,
  p_start_date date default null, p_is_milestone boolean default false
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
    due_date, start_date, is_milestone, created_by
  )
  values (
    p_id, v_workspace_id, p_parent_id, 'task', p_title, p_status_id, p_priority, p_assignee_id,
    p_due_date, p_start_date, p_is_milestone, auth.uid()
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

grant execute on function public.create_task_node(uuid, uuid, text, uuid, numeric, text, uuid, date, uuid, date, boolean) to authenticated;
grant execute on function public.would_create_cycle(uuid, uuid) to authenticated;
