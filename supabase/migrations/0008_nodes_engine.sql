-- 0008_nodes_engine.sql — motor de nodos genéricos: nodes + node_memberships,
-- backfill desde spaces/projects/tasks (ids reutilizados 1:1, ver nota),
-- RLS reescrita, RPCs reescritas/nuevas. Migración ADITIVA y reversible:
-- spaces/projects/tasks siguen existiendo hasta 0009_nodes_cleanup.sql.
--
-- Nota de backfill: los `id` de spaces/projects/tasks se REUTILIZAN como `id`
-- de los nodos equivalentes (no se genera una tabla de mapeo de ids). Esto
-- evita que statuses.project_id necesite reescribirse (mismo valor, solo
-- cambia el destino de la FK), y que comments/task_labels/activity_log solo
-- necesiten un rename de columna (mismo valor de FK, apunta al mismo id,
-- ahora en `nodes`).

-- ============================================================
-- 1. Tabla nodes
-- ============================================================
create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.nodes(id) on delete cascade,
  type text not null check (type in ('space', 'folder', 'project', 'task', 'doc')),
  title text not null,
  description text,
  status_id uuid references public.statuses(id) on delete set null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  assignee_id uuid references public.profiles(id) on delete set null,
  custom_fields jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_nodes_workspace_id on public.nodes(workspace_id);
create index idx_nodes_parent_id on public.nodes(parent_id);
create index idx_nodes_type on public.nodes(type);
create index idx_nodes_status_id on public.nodes(status_id) where status_id is not null;
create index idx_nodes_assignee_id on public.nodes(assignee_id) where assignee_id is not null;
-- Sin índice GIN en custom_fields todavía: cero queries lo filtran hoy
-- (YAGNI). Agregar `gin(custom_fields jsonb_path_ops)` cuando F5 implemente
-- filtros por campo personalizado, no antes.

create trigger trg_nodes_updated_at
  before update on public.nodes
  for each row execute function public.set_updated_at(); -- reusa la de 0001

-- ============================================================
-- 2. Tabla node_memberships
-- ============================================================
create table public.node_memberships (
  node_id uuid not null references public.nodes(id) on delete cascade,
  container_id uuid not null references public.nodes(id) on delete cascade,
  position numeric not null default 0,
  added_at timestamptz not null default now(),
  primary key (node_id, container_id)
);

-- Ruta caliente: "tareas de este contenedor, ordenadas" (board/list).
create index idx_node_memberships_container_position
  on public.node_memberships(container_id, position);
-- Ruta inversa: "en qué contenedores vive este nodo" (futuro multi-homing UI).
create index idx_node_memberships_node_id on public.node_memberships(node_id);

alter table public.nodes enable row level security;
alter table public.node_memberships enable row level security;

-- ============================================================
-- 3. Backfill: spaces -> nodes (type='space'), ids reutilizados
-- ============================================================
insert into public.nodes (id, workspace_id, parent_id, type, title, custom_fields, created_at, updated_at)
select
  s.id, s.workspace_id, null, 'space', s.name,
  case when s.color is not null then jsonb_build_object('color', s.color) else '{}'::jsonb end,
  s.created_at, s.created_at
from public.spaces s;

-- ============================================================
-- 4. Backfill: projects -> nodes (type='project', parent_id = space)
-- ============================================================
insert into public.nodes (id, workspace_id, parent_id, type, title, created_at, updated_at)
select p.id, sp.workspace_id, p.space_id, 'project', p.name, p.created_at, p.created_at
from public.projects p
join public.spaces sp on sp.id = p.space_id;

-- ============================================================
-- 5. Backfill: tasks -> nodes (type='task')
--    parent_id: solo subtareas reales (parent_task_id). Las tareas
--    top-level quedan con parent_id = null — su "home" vive en
--    node_memberships, no acá (ver 4.2 del PLAN.md).
-- ============================================================
insert into public.nodes (
  id, workspace_id, parent_id, type, title, description, status_id,
  priority, due_date, assignee_id, created_by, created_at, updated_at
)
select
  t.id, t.workspace_id, t.parent_task_id, 'task', t.title, t.description,
  t.status_id, t.priority, t.due_date, t.assignee_id, t.created_by,
  t.created_at, t.updated_at
from public.tasks t;

-- ============================================================
-- 6. Backfill: node_memberships desde tasks top-level
--    (subtareas NO reciben fila acá, a propósito — ver 4.2)
-- ============================================================
insert into public.node_memberships (node_id, container_id, position, added_at)
select t.id, t.project_id, t.position, t.created_at
from public.tasks t
where t.parent_task_id is null;

-- ============================================================
-- 7. statuses: repuntar FK a nodes (mismo valor de columna, cero UPDATE)
-- ============================================================
alter table public.statuses drop constraint statuses_project_id_fkey;
alter table public.statuses
  add constraint statuses_project_id_fkey
  foreign key (project_id) references public.nodes(id) on delete cascade;

-- Integridad "blanda": project_id debe apuntar a un nodo type='project'.
-- No se puede expresar como CHECK/FK parcial en Postgres -> trigger.
create function public.enforce_status_project_type()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.nodes where id = new.project_id and type = 'project') then
    raise exception 'statuses.project_id (%) debe referenciar un nodo type=project', new.project_id;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_status_project_type
  before insert or update of project_id on public.statuses
  for each row execute function public.enforce_status_project_type();

-- ============================================================
-- 8. Rename de FKs: task_id -> node_id (mismo valor, mismo id físico
--    porque el backfill de #5 reutilizó los ids de tasks como ids de nodes)
-- ============================================================
alter table public.comments rename column task_id to node_id;
alter table public.comments drop constraint comments_task_id_fkey;
alter table public.comments
  add constraint comments_node_id_fkey foreign key (node_id) references public.nodes(id) on delete cascade;

alter table public.task_labels rename column task_id to node_id;
alter table public.task_labels drop constraint task_labels_task_id_fkey;
alter table public.task_labels
  add constraint task_labels_node_id_fkey foreign key (node_id) references public.nodes(id) on delete cascade;
-- Nota: la tabla se llama `task_labels` todavía (no se renombra en esta
-- migración — alcance explícito era la FK, no el nombre de tabla). Deuda
-- menor documentada, renombrable después sin romper nada porque no hay
-- lectura por nombre de tabla en RLS ni en índices por fuera de FKs.

alter table public.activity_log rename column task_id to node_id;
alter table public.activity_log drop constraint activity_log_task_id_fkey;
alter table public.activity_log
  add constraint activity_log_node_id_fkey foreign key (node_id) references public.nodes(id) on delete cascade;

-- comment_mentions no tiene FK a task directamente (solo comment_id +
-- mentioned_user_id) — nada que renombrar acá, solo sus policies (sección 13).

-- ============================================================
-- 9. Drop trigger de 1-nivel (jerarquía real vía parent_id ahora)
-- ============================================================
drop trigger trg_enforce_one_level_subtask on public.tasks;
drop function public.enforce_one_level_subtask();

-- ============================================================
-- 10. activity_log: trigger nuevo sobre nodes, scope limitado a
--     type='task' (mismo alcance funcional que tenía antes sobre `tasks`,
--     evita ruido de activity_log para space/project/doc que la UI
--     todavía no consume). El filtro de type se hace DENTRO de la función
--     (no vía WHEN en el CREATE TRIGGER): Postgres no permite referenciar
--     NEW en un trigger de DELETE ni OLD en uno de INSERT dentro de la
--     cláusula WHEN, ni siquiera envueltos en coalesce() — falla en el
--     CREATE TRIGGER, no en runtime.
--
--     Solo INSERT/UPDATE, sin rama DELETE (a diferencia del viejo
--     log_task_activity): `activity_log.node_id` tiene `on delete cascade`,
--     así que una fila 'task_deleted' insertada por un trigger AFTER DELETE
--     viola la FK de inmediato (el nodo referenciado ya no existe en esa
--     misma transacción) — y aunque se insertara antes del delete (BEFORE
--     DELETE), esa misma fila quedaría cascade-borrada por el propio DELETE
--     que la originó, siendo un no-op funcional. Nadie consulta el activity
--     feed de una tarea ya eliminada, así que no hay valor de producto que
--     se pierda al no loguear la eliminación — confirmado empíricamente al
--     aplicar esta migración contra el proyecto real (ver historial de
--     verificación).
-- ============================================================
create function public.log_node_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type != 'task' then return new; end if;
    insert into public.activity_log (workspace_id, node_id, actor_id, action, payload)
    values (new.workspace_id, new.id, auth.uid(), 'task_created', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if new.type != 'task' then return new; end if;
    insert into public.activity_log (workspace_id, node_id, actor_id, action, payload)
    values (new.workspace_id, new.id, auth.uid(), 'task_updated',
            jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  end if;
  return new;
end;
$$;

create trigger trg_log_node_activity
  after insert or update on public.nodes
  for each row execute function public.log_node_activity();

-- ============================================================
-- 11. RLS: nodes, node_memberships (nuevas, 0-1 hop)
-- ============================================================
create policy "nodes_all_member" on public.nodes
  for all to authenticated
  using (public.is_member_of(workspace_id)) with check (public.is_member_of(workspace_id));

create policy "node_memberships_all_member" on public.node_memberships
  for all to authenticated using (
    exists (select 1 from public.nodes n where n.id = node_memberships.container_id and public.is_member_of(n.workspace_id))
  ) with check (
    exists (select 1 from public.nodes n where n.id = node_memberships.container_id and public.is_member_of(n.workspace_id))
    and exists (select 1 from public.nodes n2 where n2.id = node_memberships.node_id and public.is_member_of(n2.workspace_id))
  );

-- ============================================================
-- 12. RLS: statuses reescrita (2 hops -> 1 hop, simplificación real)
-- ============================================================
drop policy "statuses_all_member" on public.statuses;
create policy "statuses_all_member" on public.statuses
  for all to authenticated using (
    exists (select 1 from public.nodes n where n.id = statuses.project_id and public.is_member_of(n.workspace_id))
  ) with check (
    exists (select 1 from public.nodes n where n.id = statuses.project_id and public.is_member_of(n.workspace_id)));

-- ============================================================
-- 13. RLS: comments / task_labels / comment_mentions
--     reescritas para joinear contra nodes en vez de tasks
--     (activity_log ya usaba workspace_id directo, sin cambios funcionales)
-- ============================================================
drop policy "comments_select" on public.comments;
drop policy "comments_insert_self" on public.comments;
drop policy "comments_delete_own_or_admin" on public.comments;
create policy "comments_select" on public.comments
  for select to authenticated using (
    exists (select 1 from public.nodes n where n.id = comments.node_id and public.is_member_of(n.workspace_id)));
create policy "comments_insert_self" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid() and
    exists (select 1 from public.nodes n where n.id = comments.node_id and public.is_member_of(n.workspace_id)));
create policy "comments_delete_own_or_admin" on public.comments
  for delete to authenticated using (
    author_id = auth.uid() or
    exists (select 1 from public.nodes n where n.id = comments.node_id and public.is_admin_of(n.workspace_id)));

drop policy "task_labels_all_member" on public.task_labels;
create policy "task_labels_all_member" on public.task_labels
  for all to authenticated using (
    exists (select 1 from public.nodes n where n.id = task_labels.node_id and public.is_member_of(n.workspace_id))
  ) with check (
    exists (
      select 1 from public.nodes n join public.labels l on l.workspace_id = n.workspace_id
      where n.id = task_labels.node_id and l.id = task_labels.label_id
        and public.is_member_of(n.workspace_id)));

drop policy "comment_mentions_select_member" on public.comment_mentions;
drop policy "comment_mentions_insert_member" on public.comment_mentions;
create policy "comment_mentions_select_member" on public.comment_mentions
  for select to authenticated using (
    exists (select 1 from public.comments c join public.nodes n on n.id = c.node_id
            where c.id = comment_mentions.comment_id and public.is_member_of(n.workspace_id)));
create policy "comment_mentions_insert_member" on public.comment_mentions
  for insert to authenticated with check (
    exists (
      select 1 from public.comments c join public.nodes n on n.id = c.node_id
      join public.memberships m on m.workspace_id = n.workspace_id
      where c.id = comment_mentions.comment_id
        and m.user_id = comment_mentions.mentioned_user_id
        and public.is_member_of(n.workspace_id)));
-- comment_mentions_update_own sin cambios (no depende de task_id).

-- ============================================================
-- 14. RPCs reescritas
-- ============================================================
create or replace function public.create_project_with_defaults(p_space_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_project_id uuid;
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_space_id and type = 'space';
  if v_workspace_id is null then
    raise exception 'space % no existe o no es de tipo space', p_space_id;
  end if;

  insert into public.nodes (workspace_id, parent_id, type, title, created_by)
  values (v_workspace_id, p_space_id, 'project', p_name, auth.uid())
  returning id into v_project_id;

  insert into public.statuses (project_id, name, status_kind, position, is_default)
  values
    (v_project_id, 'Por hacer',   'neutral', 0, true),
    (v_project_id, 'En progreso', 'neutral', 1, false),
    (v_project_id, 'Hecho',       'success', 2, false);

  return v_project_id;
end;
$$;

create or replace function public.create_workspace_with_defaults(p_name text)
returns table (workspace_id uuid, project_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_space_id uuid;
  v_project_id uuid;
  v_slug text;
begin
  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);

  insert into public.workspaces (name, slug, created_by)
  values (p_name, v_slug, auth.uid())
  returning id into v_workspace_id;

  insert into public.memberships (workspace_id, user_id, role)
  values (v_workspace_id, auth.uid(), 'owner');

  insert into public.nodes (workspace_id, parent_id, type, title, created_by)
  values (v_workspace_id, null, 'space', 'General', auth.uid())
  returning id into v_space_id;

  v_project_id := public.create_project_with_defaults(v_space_id, 'Proyecto de ejemplo');

  return query select v_workspace_id, v_project_id;
end;
$$;

-- Postgres no permite renombrar un parámetro vía CREATE OR REPLACE FUNCTION
-- (error 42P13) — hay que dropear la firma vieja (p_project_id) primero.
drop function public.rebalance_positions(uuid);

create function public.rebalance_positions(p_container_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  with ranked as (
    select nm.node_id, nm.container_id, n.status_id,
           row_number() over (partition by n.status_id order by nm.position) as rn
    from public.node_memberships nm
    join public.nodes n on n.id = nm.node_id
    where nm.container_id = p_container_id
  )
  update public.node_memberships nm
  set position = ranked.rn * 1000
  from ranked
  where nm.node_id = ranked.node_id and nm.container_id = ranked.container_id;
end;
$$;

create or replace function public.create_task_node(
  p_id uuid, p_container_id uuid, p_title text, p_status_id uuid, p_position numeric,
  p_priority text default 'medium', p_assignee_id uuid default null,
  p_due_date date default null, p_parent_id uuid default null
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

  insert into public.nodes (id, workspace_id, parent_id, type, title, status_id, priority, assignee_id, due_date, created_by)
  values (p_id, v_workspace_id, p_parent_id, 'task', p_title, p_status_id, p_priority, p_assignee_id, p_due_date, auth.uid());

  -- Subtareas (p_parent_id no nulo) no reciben fila en node_memberships,
  -- ver 4.2 del PLAN.md.
  if p_parent_id is null then
    insert into public.node_memberships (node_id, container_id, position)
    values (p_id, p_container_id, p_position);
  end if;

  return p_id;
end;
$$;

create or replace function public.move_task_node(
  p_node_id uuid, p_container_id uuid, p_status_id uuid, p_position numeric
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.nodes set status_id = p_status_id where id = p_node_id;
  update public.node_memberships set position = p_position
  where node_id = p_node_id and container_id = p_container_id;
end;
$$;

create or replace function public.move_project_tasks(
  p_from_project_id uuid, p_to_project_id uuid, p_to_status_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.nodes n set status_id = p_to_status_id
  where n.id in (select node_id from public.node_memberships where container_id = p_from_project_id);

  update public.node_memberships
  set container_id = p_to_project_id
  where container_id = p_from_project_id;
end;
$$;

create or replace function public.delete_project_with_tasks(p_project_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.nodes
  where id in (select node_id from public.node_memberships where container_id = p_project_id);
  -- delete del propio project cascadea node_memberships (container_id FK)
  -- y statuses (statuses.project_id FK on delete cascade, sin cambios).
  delete from public.nodes where id = p_project_id;
end;
$$;

grant execute on function public.create_project_with_defaults(uuid, text) to authenticated;
grant execute on function public.create_workspace_with_defaults(text) to authenticated;
grant execute on function public.rebalance_positions(uuid) to authenticated;
grant execute on function public.create_task_node(uuid, uuid, text, uuid, numeric, text, uuid, date, uuid) to authenticated;
grant execute on function public.move_task_node(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.move_project_tasks(uuid, uuid, uuid) to authenticated;
grant execute on function public.delete_project_with_tasks(uuid) to authenticated;
