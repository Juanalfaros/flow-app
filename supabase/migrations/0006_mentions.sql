-- 0006_mentions.sql — menciones en comentarios. Ver plan F2 M5.
-- Tabla separada (no un formato embebido en comments.body): mantiene el
-- body como texto plano legible y permite trackear el estado "visto"
-- por persona.

create table public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  seen_at timestamptz,
  primary key (comment_id, mentioned_user_id)
);

alter table public.comment_mentions enable row level security;

create policy "comment_mentions_select_member" on public.comment_mentions
  for select to authenticated using (
    exists (select 1 from public.comments c join public.tasks t on t.id = c.task_id
            where c.id = comment_mentions.comment_id and public.is_member_of(t.workspace_id)));

create policy "comment_mentions_insert_member" on public.comment_mentions
  for insert to authenticated with check (
    exists (
      select 1 from public.comments c join public.tasks t on t.id = c.task_id
      join public.memberships m on m.workspace_id = t.workspace_id
      where c.id = comment_mentions.comment_id
        and m.user_id = comment_mentions.mentioned_user_id
        and public.is_member_of(t.workspace_id)));

create policy "comment_mentions_update_own" on public.comment_mentions
  for update to authenticated
  using (mentioned_user_id = auth.uid()) with check (mentioned_user_id = auth.uid());
