-- 0059_notify_on_mention_opt_out.sql — respeta profiles.notify_on_mention
-- (0058_profile_preferences.sql) en el trigger de menciones.
--
-- `notify_from_mention()` (0016_notifications.sql) siempre insertaba una
-- notificación al mencionar a alguien — el checkbox "Notificarme cuando
-- me mencionan" de Preferencias era puro mock. Se reemplaza la función
-- (mismo trigger, no se toca `trg_notify_from_mention`) agregando un
-- chequeo del flag antes del insert.

create or replace function public.notify_from_mention()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_node_id uuid;
  v_author_id uuid;
  v_notify_on_mention boolean;
begin
  select c.node_id, n.workspace_id, c.author_id into v_node_id, v_workspace_id, v_author_id
  from public.comments c join public.nodes n on n.id = c.node_id
  where c.id = new.comment_id;

  select p.notify_on_mention into v_notify_on_mention
  from public.profiles p where p.id = new.mentioned_user_id;

  if new.mentioned_user_id != v_author_id and coalesce(v_notify_on_mention, true) then
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (v_workspace_id, new.mentioned_user_id, v_author_id, v_node_id, 'mention', jsonb_build_object('comment_id', new.comment_id));
  end if;
  return new;
end;
$$;
