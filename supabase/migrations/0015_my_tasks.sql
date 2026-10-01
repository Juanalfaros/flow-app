-- 0015_my_tasks.sql — soporte para la página "Mis tareas": tareas
-- personales (sin proyecto) y tracking de "visto recientemente".

-- ============================================================
-- 1. nodes: completed_at
-- ============================================================
-- Concepto de "hecha" para tareas personales, que no tienen proyecto y
-- por lo tanto no pueden usar statuses/status_kind (statuses.project_id
-- las ata a un proyecto — ver 0008_nodes_engine.sql). Nullable, sin uso
-- en tareas de proyecto (siguen resolviendo "hecha" vía status_kind).
alter table public.nodes add column completed_at timestamptz;

-- ============================================================
-- 2. recent_views
-- ============================================================
-- Última vez que cada usuario abrió cada nodo. PK compuesta (upsert on
-- conflict) en vez de historial completo — solo interesa el último
-- vistazo por nodo, no cada apertura.
create table public.recent_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

create index idx_recent_views_user on public.recent_views(user_id, viewed_at desc);

alter table public.recent_views enable row level security;

-- Mismo patrón 0-1 hop que el resto (PLAN.md §4.5.4). No se agrega a la
-- publicación realtime (igual que `favorites`, ver 0013) — es dato
-- personal, no colaborativo.
create policy "recent_views_all_own" on public.recent_views
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.nodes n where n.id = node_id and public.is_member_of(n.workspace_id))
  );
