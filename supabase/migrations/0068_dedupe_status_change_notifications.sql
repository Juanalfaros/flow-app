-- 0068_dedupe_status_change_notifications.sql — evita la notificación
-- 'status_changed' duplicada cuando el destinatario de una regla
-- `notify_on_status` (0063) también es responsable o creador de la tarea.
--
-- El problema: `notify_from_activity` (0042) ya notifica 'status_changed'
-- a TODOS los `task_assignees` actuales + `created_by` de la tarea, en
-- cualquier cambio de status_id — es la notificación estándar, sin
-- automatización de por medio. `apply_status_change_automations` (0063)
-- dispara sobre la MISMA tabla/evento (`after update of status_id on
-- nodes`) de forma totalmente independiente. Si el `target_user_id` de
-- una regla (o, en el caso "todo el proyecto", cualquier miembro con
-- acceso) también es responsable o creador de esa tarea — el caso más
-- común, "avisame cuando pase a Listo" sobre alguien que ya es assignee —
-- esa persona recibía DOS notificaciones distintas por el mismo evento.
--
-- El fix: excluir de `apply_status_change_automations` a quien ya recibe
-- la notificación estándar (`task_assignees` de esta tarea + `created_by`,
-- mismo criterio que usa `notify_from_activity` — `new` acá es la misma
-- fila `nodes`, así que `new.created_by` está directo, sin subquery).
-- Preserva el caso de uso real de la automatización (avisar a alguien que
-- NO es responsable, ej. QA) sin duplicar el caso común.
create or replace function public.apply_status_change_automations()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_container_id uuid;
  v_rule record;
  v_member record;
begin
  if new.type != 'task' or new.status_id is not distinct from old.status_id then
    return new;
  end if;

  select container_id into v_container_id from public.node_memberships where node_id = new.id;
  if v_container_id is null then
    return new; -- subtarea: no tiene container propio, no le aplican reglas de proyecto
  end if;

  for v_rule in
    select * from public.automation_rules
    where project_id = v_container_id and status_id = new.status_id and enabled
      and kind in ('notify_on_status', 'label_on_status')
  loop
    if v_rule.kind = 'label_on_status' then
      insert into public.task_labels (node_id, label_id)
      values (new.id, v_rule.label_id)
      on conflict do nothing;
    elsif v_rule.kind = 'notify_on_status' then
      if v_rule.notify_whole_project then
        for v_member in select user_id from public.memberships where workspace_id = new.workspace_id loop
          if v_member.user_id != auth.uid()
             and v_member.user_id != new.created_by
             and not exists (
               select 1 from public.task_assignees where node_id = new.id and user_id = v_member.user_id
             )
             and public.can_user_access_node(v_member.user_id, v_container_id) then
            insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
            values (new.workspace_id, v_member.user_id, auth.uid(), new.id, 'status_changed',
                    jsonb_build_object('automation_rule_id', v_rule.id, 'after_status_id', new.status_id));
          end if;
        end loop;
      elsif v_rule.target_user_id is not null
            and v_rule.target_user_id != auth.uid()
            and v_rule.target_user_id != new.created_by
            and not exists (
              select 1 from public.task_assignees where node_id = new.id and user_id = v_rule.target_user_id
            ) then
        insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
        values (new.workspace_id, v_rule.target_user_id, auth.uid(), new.id, 'status_changed',
                jsonb_build_object('automation_rule_id', v_rule.id, 'after_status_id', new.status_id));
      end if;
    end if;
  end loop;
  return new;
end;
$$;
