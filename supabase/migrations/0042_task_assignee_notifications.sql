-- 0042_task_assignee_notifications.sql — notificaciones sobre
-- task_assignees (0041), no solo sobre el assignee_id escalar.
--
-- Un insert/delete en task_assignees es invisible para `activity_log`: su
-- trigger `log_node_activity` (0008_nodes_engine.sql) solo diffea la fila
-- de `nodes`, y task_assignees es una tabla aparte. Por eso la notificación
-- de "te asignaron" pasa a un trigger nuevo, directo sobre task_assignees
-- — mismo criterio que ya usa `notify_from_comment` (dispara desde
-- `comments`, no desde `activity_log`).
--
-- Decisión ya cerrada con el usuario: notificar a TODOS los responsables
-- actuales de la tarea, menos a quien actuó — no solo al principal.

-- ============================================================
-- 1. Notificación de asignación — trigger nuevo sobre task_assignees
-- ============================================================
create function public.notify_from_task_assignee()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = new.node_id;
  if new.user_id != auth.uid() then
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (v_workspace_id, new.user_id, auth.uid(), new.node_id, 'assigned', '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger trg_notify_from_task_assignee
  after insert on public.task_assignees
  for each row execute function public.notify_from_task_assignee();

-- ============================================================
-- 2. notify_from_activity — se saca la rama vieja de "assignee_id
--    cambió" (ahora redundante: trg_sync_assignee_id_to_task_assignees,
--    0041, ya inserta en task_assignees, y eso ya dispara el trigger de
--    arriba — dejarla habría notificado dos veces la misma asignación).
--    El fanout de status_changed pasa de leer el assignee_id escalar del
--    `payload` a recorrer task_assignees en vivo.
-- ============================================================
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
    end if;
  end if;
  -- Rama `task_created` eliminada: create_task_node ya dispara
  -- trg_sync_assignee_id_to_task_assignees (0041) para el p_assignee_id
  -- inicial, que a su vez dispara trg_notify_from_task_assignee arriba —
  -- notificar acá también sería la misma asignación por partida doble.
  return new;
end;
$$;

-- ============================================================
-- 3. notify_from_comment — fanout a TODOS los responsables actuales
--    (task_assignees), no solo al assignee_id escalar, menos el autor
--    del comentario.
-- ============================================================
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
  return new;
end;
$$;
