-- 0043_task_watchers.sql — seguidores: gente que quiere enterarse de una
-- tarea sin ser responsable de ella (p.ej. el cliente que solo quiere ver
-- el estado de "Enviar cotización"). Misma forma que task_assignees
-- (0041) — muchos-a-muchos, escritura directa del cliente — pero sin
-- ningún concepto de "principal": un seguidor es un seguidor, no hay
-- sincronización con ninguna otra columna.

create table public.task_watchers (
  node_id uuid not null references public.nodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (node_id, user_id)
);

create index idx_task_watchers_user_id on public.task_watchers(user_id);

alter table public.task_watchers enable row level security;

-- Mismo shape que task_assignees_access (0041).
create policy "task_watchers_access" on public.task_watchers
  for all to authenticated using (
    exists (
      select 1 from public.nodes n
      where n.id = task_watchers.node_id
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_node(n.id))
    )
  ) with check (
    exists (
      select 1 from public.nodes n
      join public.memberships m on m.workspace_id = n.workspace_id
      where n.id = task_watchers.node_id
        and m.user_id = task_watchers.user_id
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_node(n.id))
    )
  );

-- Nuevo tipo de notificación, separado de 'status_changed'/'comment' para
-- que el bell pueda distinguir "estás viendo esto" de "esto es tuyo".
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned', 'status_changed', 'comment', 'mention', 'watched_activity'));

-- notify_from_activity: segundo loop sobre task_watchers, excluyendo a
-- quien ya es responsable (para no notificar dos veces a la misma
-- persona por el mismo evento — ver el `not in` de abajo).
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

    if (v_before->>'status_id') is distinct from (v_after->>'status_id') then
      for v_recipient in
        select distinct r from (
          select user_id as r from public.task_assignees where node_id = new.node_id
          union
          select (v_after->>'created_by')::uuid
        ) as recipients(r)
        where r is not null and r != new.actor_id
      loop
        insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
        values (
          new.workspace_id, v_recipient, new.actor_id, new.node_id, 'status_changed',
          jsonb_build_object('before_status_id', v_before->>'status_id', 'after_status_id', v_after->>'status_id')
        );
      end loop;

      for v_recipient in
        select user_id from public.task_watchers
        where node_id = new.node_id
          and user_id != new.actor_id
          and user_id not in (select user_id from public.task_assignees where node_id = new.node_id)
      loop
        insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
        values (
          new.workspace_id, v_recipient, new.actor_id, new.node_id, 'watched_activity',
          jsonb_build_object('before_status_id', v_before->>'status_id', 'after_status_id', v_after->>'status_id')
        );
      end loop;
    end if;
  end if;
  return new;
end;
$$;

-- notify_from_comment: mismo criterio — task_watchers menos task_assignees
-- menos el autor del comentario.
create or replace function public.notify_from_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_created_by uuid;
  v_recipient uuid;
begin
  select workspace_id, created_by into v_workspace_id, v_created_by
  from public.nodes where id = new.node_id;

  for v_recipient in
    select distinct r from (
      select user_id as r from public.task_assignees where node_id = new.node_id
      union
      select v_created_by
    ) as recipients(r)
    where r is not null and r != new.author_id
  loop
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (v_workspace_id, v_recipient, new.author_id, new.node_id, 'comment', jsonb_build_object('comment_id', new.id));
  end loop;

  for v_recipient in
    select user_id from public.task_watchers
    where node_id = new.node_id
      and user_id != new.author_id
      and user_id not in (select user_id from public.task_assignees where node_id = new.node_id)
  loop
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (v_workspace_id, v_recipient, new.author_id, new.node_id, 'watched_activity', jsonb_build_object('comment_id', new.id));
  end loop;
  return new;
end;
$$;
