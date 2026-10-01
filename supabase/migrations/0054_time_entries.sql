-- 0054_time_entries.sql — F5 #6: time tracking, solo entrada manual (sin
-- timer en vivo — decisión de alcance cerrada con el usuario: sin timer no
-- hay estado de "corriendo" que sincronizar entre pestañas/dispositivos).
--
-- Mismo patrón que `comments` (0001/0008): tabla plana colgada de
-- `node_id`, RLS vía `can_access_node`, cada quien escribe la suya propia
-- (a diferencia de comments, acá ni siquiera hace falta un
-- `_delete_own_or_admin` — nadie necesita borrar el registro de otra
-- persona salvo un admin, mismo criterio que comments_delete_own_or_admin).

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  minutes int not null check (minutes > 0),
  entry_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index idx_time_entries_node_id on public.time_entries(node_id);
create index idx_time_entries_user_id on public.time_entries(user_id);

alter table public.time_entries enable row level security;

create policy "time_entries_select" on public.time_entries
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = time_entries.node_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_node(n.id))));

create policy "time_entries_insert_self" on public.time_entries
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.nodes n
                where n.id = time_entries.node_id
                  and (n.space_id is null and public.is_member_of(n.workspace_id)
                       or public.can_access_node(n.id))));

-- Igual que comments_delete_own_or_admin (0008): cada quien borra lo
-- suyo, un admin del workspace puede corregir cualquier registro.
create policy "time_entries_delete_own_or_admin" on public.time_entries
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.nodes n
               where n.id = time_entries.node_id and public.is_admin_of(n.workspace_id)));

comment on table public.time_entries is
  'Entrada manual de tiempo por tarea (F5 #6). Sin timer en vivo — decisión de alcance, ver PLAN.md.';
