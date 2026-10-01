-- 0016_notifications.sql — sistema de notificaciones unificado (te
-- asignaron una tarea, cambió el estado de una tarea tuya, comentaron
-- en una tarea tuya, te mencionaron). Generado 100% por triggers, nunca
-- desde el cliente — mismo espíritu que `log_node_activity`
-- (0008_nodes_engine.sql), del cual el trigger 1 de acá es consumidor
-- directo (lee su output en vez de recalcular el diff).

-- ============================================================
-- 1. notifications
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  node_id uuid references public.nodes(id) on delete cascade,
  type text not null check (type in ('assigned', 'status_changed', 'comment', 'mention')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index idx_notifications_recipient on public.notifications(recipient_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

create policy "notifications_update_own" on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Sin policy de insert para `authenticated`: solo escriben los triggers
-- `security definer` de abajo, igual que `activity_log` (0008, "no hay
-- insert policy para authenticated, solo el trigger escribe").

-- ============================================================
-- 2. notify_from_activity — asignación y cambio de estado
-- ============================================================
-- Consume `activity_log` en vez de leer `nodes` directo: `log_node_activity`
-- ya calculó before/after (task_updated) o el estado inicial completo
-- (task_created), no tiene sentido repetir ese diff acá.
create or replace function public.notify_from_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_recipient uuid;
begin
  if new.action = 'task_updated' then
    v_before := new.payload->'before';
    v_after := new.payload->'after';

    if (v_before->>'assignee_id') is distinct from (v_after->>'assignee_id')
       and (v_after->>'assignee_id') is not null
       and (v_after->>'assignee_id')::uuid != new.actor_id then
      insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
      values (new.workspace_id, (v_after->>'assignee_id')::uuid, new.actor_id, new.node_id, 'assigned', '{}'::jsonb);
    end if;

    if (v_before->>'status_id') is distinct from (v_after->>'status_id') then
      for v_recipient in
        select distinct r from (
          values ((v_after->>'assignee_id')::uuid), ((v_after->>'created_by')::uuid)
        ) as recipients(r)
        where r is not null and r != new.actor_id
      loop
        insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
        values (
          new.workspace_id, v_recipient, new.actor_id, new.node_id, 'status_changed',
          jsonb_build_object('before_status_id', v_before->>'status_id', 'after_status_id', v_after->>'status_id')
        );
      end loop;
    end if;
  elsif new.action = 'task_created' then
    v_after := new.payload;
    if (v_after->>'assignee_id') is not null and (v_after->>'assignee_id')::uuid != new.actor_id then
      insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
      values (new.workspace_id, (v_after->>'assignee_id')::uuid, new.actor_id, new.node_id, 'assigned', '{}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_notify_from_activity
  after insert on public.activity_log
  for each row execute function public.notify_from_activity();

-- ============================================================
-- 3. notify_from_comment — comentaron en una tarea tuya
-- ============================================================
create or replace function public.notify_from_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_assignee_id uuid;
  v_created_by uuid;
  v_recipient uuid;
begin
  select workspace_id, assignee_id, created_by into v_workspace_id, v_assignee_id, v_created_by
  from public.nodes where id = new.node_id;

  for v_recipient in
    select distinct r from (values (v_assignee_id), (v_created_by)) as recipients(r)
    where r is not null and r != new.author_id
  loop
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (v_workspace_id, v_recipient, new.author_id, new.node_id, 'comment', jsonb_build_object('comment_id', new.id));
  end loop;
  return new;
end;
$$;

create trigger trg_notify_from_comment
  after insert on public.comments
  for each row execute function public.notify_from_comment();

-- ============================================================
-- 4. notify_from_mention — te mencionaron
-- ============================================================
-- `comment_mentions` sigue siendo el registro de "quién fue mencionado
-- en qué comentario" (no se toca ni se migra) — esto solo agrega la
-- fila de notificación correspondiente.
create or replace function public.notify_from_mention()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_node_id uuid;
  v_author_id uuid;
begin
  select c.node_id, n.workspace_id, c.author_id into v_node_id, v_workspace_id, v_author_id
  from public.comments c join public.nodes n on n.id = c.node_id
  where c.id = new.comment_id;

  if new.mentioned_user_id != v_author_id then
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (v_workspace_id, new.mentioned_user_id, v_author_id, v_node_id, 'mention', jsonb_build_object('comment_id', new.comment_id));
  end if;
  return new;
end;
$$;

create trigger trg_notify_from_mention
  after insert on public.comment_mentions
  for each row execute function public.notify_from_mention();

-- ============================================================
-- 5. Backfill: menciones no vistas antes de esta migración
-- ============================================================
-- El bell/bandeja dejan de leer `comment_mentions.seen_at` a partir de
-- este cambio (ver notifications/queries.ts) — sin este backfill, las
-- menciones no leídas de antes de hoy desaparecerían de la vista del
-- usuario de un día para el otro.
insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload, created_at)
select n.workspace_id, cm.mentioned_user_id, c.author_id, c.node_id, 'mention',
       jsonb_build_object('comment_id', cm.comment_id), c.created_at
from public.comment_mentions cm
join public.comments c on c.id = cm.comment_id
join public.nodes n on n.id = c.node_id
where cm.seen_at is null;

-- ============================================================
-- 6. Realtime
-- ============================================================
alter publication supabase_realtime add table public.notifications;
