-- 0013_favorites.sql — tabla de favoritos por usuario (botón ⭐ junto al
-- breadcrumb del proyecto). Alcance v1: solo nodos type='project' (donde
-- vive el botón hoy), pero la tabla no restringe por tipo — no vale la
-- pena un CHECK que habría que migrar de nuevo si se favoritean folders
-- más adelante.

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

create index idx_favorites_user_id on public.favorites(user_id);

alter table public.favorites enable row level security;

-- Sin política de update: el toggle es insert/delete, nunca se edita una
-- fila existente.
create policy "favorites_select_own" on public.favorites
  for select to authenticated using (user_id = auth.uid());

create policy "favorites_insert_own" on public.favorites
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.nodes n where n.id = node_id and public.is_member_of(n.workspace_id))
  );

create policy "favorites_delete_own" on public.favorites
  for delete to authenticated using (user_id = auth.uid());

-- No se agrega a la publicación de realtime (0007_realtime_publication.sql
-- la limita a `tasks` a propósito) — sincroniza vía refetch normal de
-- TanStack Query al montar, no push.
