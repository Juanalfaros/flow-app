-- 0001_init.sql — esquema base de "nodo"
-- F0: RLS habilitado en todas las tablas. Las policies de este archivo
-- son PLACEHOLDERS deliberadamente permisivos (bloquean anon, permiten
-- todo a authenticated). Las policies reales basadas en membership
-- llegan en F1/F2 — NO asumir que esto es seguro para producción real.

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. WORKSPACES / SPACES / PROJECTS
-- ============================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

create index idx_spaces_workspace_id on public.spaces(workspace_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index idx_projects_space_id on public.projects(space_id);

-- ============================================================
-- 2. PROFILES (auto-creado vía trigger en auth.users)
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3. MEMBERSHIPS
-- ============================================================

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'guest')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index idx_memberships_user_id on public.memberships(user_id);
create index idx_memberships_workspace_id on public.memberships(workspace_id);

-- ============================================================
-- 4. STATUSES (personalizables por proyecto, con status_kind semántico)
-- ============================================================

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  -- status_kind es independiente del nombre visible: permite que el
  -- usuario renombre el status libremente sin perder el mapeo de color
  -- semántico en el frontend (--danger / --warn / etc).
  status_kind text not null default 'neutral'
    check (status_kind in ('neutral', 'success', 'warning', 'danger')),
  position int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_statuses_project_id on public.statuses(project_id);

-- ============================================================
-- 5. TASKS (position fraccional + workspace_id denormalizado)
-- ============================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Denormalizado a propósito: se rellena por trigger desde
  -- projects -> spaces -> workspaces. Evita 3 joins en las policies
  -- de RLS sobre la tabla de mayor volumen (tasks); la policy compara
  -- workspace_id directamente y usa el índice de abajo.
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  status_id uuid references public.statuses(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date date,
  -- Indexación fraccional: al insertar/mover, se calcula el punto medio
  -- entre vecinos (ver src/lib/position.ts `between()`). Cuando la
  -- diferencia entre posiciones consecutivas cae bajo 0.0001, llamar a
  -- rebalance_positions(project_id) (ver más abajo).
  position numeric not null default 0,
  -- Subtareas: solo 1 nivel permitido (enforced por trigger, no por FK).
  parent_task_id uuid references public.tasks(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_workspace_id on public.tasks(workspace_id);
create index idx_tasks_project_status_position on public.tasks(project_id, status_id, position);
create index idx_tasks_parent_task_id on public.tasks(parent_task_id);

-- 5.1 Trigger: rellenar tasks.workspace_id desde project_id
create function public.set_task_workspace_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select sp.workspace_id into new.workspace_id
  from public.projects p
  join public.spaces sp on sp.id = p.space_id
  where p.id = new.project_id;

  if new.workspace_id is null then
    raise exception 'No se pudo resolver workspace_id para project_id=%', new.project_id;
  end if;

  return new;
end;
$$;

create trigger trg_set_task_workspace_id
  before insert or update of project_id on public.tasks
  for each row execute function public.set_task_workspace_id();

-- 5.2 Trigger: forzar máximo 1 nivel de subtareas
create function public.enforce_one_level_subtask()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grandparent uuid;
begin
  if new.parent_task_id is not null then
    select parent_task_id into grandparent
    from public.tasks
    where id = new.parent_task_id;

    if grandparent is not null then
      raise exception 'Solo se permite 1 nivel de subtareas (task % ya es una subtarea)', new.parent_task_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_one_level_subtask
  before insert or update of parent_task_id on public.tasks
  for each row execute function public.enforce_one_level_subtask();

-- 5.3 Trigger: updated_at automático
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- 5.4 Función de rebalanceo de posiciones (fractional indexing)
create function public.rebalance_positions(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ranked as (
    select id, status_id,
           row_number() over (partition by status_id order by position) as rn
    from public.tasks
    where project_id = p_project_id
  )
  update public.tasks t
  set position = ranked.rn * 1000
  from ranked
  where t.id = ranked.id;
end;
$$;

-- ============================================================
-- 6. COMMENTS
-- ============================================================

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_comments_task_id on public.comments(task_id);

-- ============================================================
-- 7. ACTIVITY LOG (solo generado por trigger, nunca desde el cliente)
-- ============================================================

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_log_task_id on public.activity_log(task_id);
create index idx_activity_log_workspace_id on public.activity_log(workspace_id);

create function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (workspace_id, task_id, actor_id, action, payload)
    values (new.workspace_id, new.id, auth.uid(), 'task_created', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into public.activity_log (workspace_id, task_id, actor_id, action, payload)
    values (new.workspace_id, new.id, auth.uid(), 'task_updated',
            jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  elsif tg_op = 'DELETE' then
    insert into public.activity_log (workspace_id, task_id, actor_id, action, payload)
    values (old.workspace_id, old.id, auth.uid(), 'task_deleted', to_jsonb(old));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_log_task_activity
  after insert or update or delete on public.tasks
  for each row execute function public.log_task_activity();

-- ============================================================
-- 8. LABELS + TASK_LABELS (many-to-many)
-- ============================================================

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (task_id, label_id)
);

-- ============================================================
-- 9. INVITATIONS
-- ============================================================

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member'
    check (role in ('admin', 'member', 'guest')),
  invited_by uuid references public.profiles(id),
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (workspace_id, email)
);

-- ============================================================
-- 10. RLS — habilitado en todo, policies placeholder para F0
-- ============================================================

alter table public.workspaces   enable row level security;
alter table public.spaces       enable row level security;
alter table public.projects     enable row level security;
alter table public.profiles     enable row level security;
alter table public.memberships  enable row level security;
alter table public.statuses     enable row level security;
alter table public.tasks        enable row level security;
alter table public.comments     enable row level security;
alter table public.activity_log enable row level security;
alter table public.labels       enable row level security;
alter table public.task_labels  enable row level security;
alter table public.invitations  enable row level security;

-- profiles: cada usuario ve/edita solo su propia fila (esta sí es
-- una policy "real", no placeholder — no depende de membership).
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Resto de tablas: placeholder F0. Bloquea anon, permite todo a
-- authenticated. REEMPLAZAR por policies basadas en membership en F1/F2.
create policy "f0_authenticated_all" on public.workspaces
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.spaces
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.projects
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.memberships
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.statuses
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.tasks
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.comments
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.labels
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.task_labels
  for all to authenticated using (true) with check (true);
create policy "f0_authenticated_all" on public.invitations
  for all to authenticated using (true) with check (true);

-- activity_log: solo lectura para authenticated. Sin policy de INSERT
-- para authenticated a propósito — únicamente el trigger
-- (security definer, corre como owner de la tabla) puede escribir.
create policy "activity_log_select" on public.activity_log
  for select to authenticated using (true);
