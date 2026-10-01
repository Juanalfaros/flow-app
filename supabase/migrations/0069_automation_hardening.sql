-- 0069_automation_hardening.sql — robustez del motor de automatizaciones
-- (0063), 3 fixes de severidad media encontrados en la auditoría de
-- seguridad/bugs (2026-09-09):

-- ============================================================
-- 1. El guard de no-op de log_node_activity (0066) no cubría
--    due_reminder_sent_at -- el propio `UPDATE nodes SET
--    due_reminder_sent_at = today` que hace sweepDueReminders
--    (worker/automation-dispatch.ts) es un cambio real, no un no-op, así
--    que reintroducía el mismo ruido que 0066 acababa de sacar: cada
--    tarea recordada dejaba una entrada "Se actualizó la tarea" en
--    Actividad sin ningún dato (due_reminder_sent_at no es uno de los
--    campos que describeActivity sabe describir). Mismo criterio que
--    updated_at: es bookkeeping interno, no algo que a un usuario le
--    importe ver como actividad.
-- ============================================================
create or replace function public.log_node_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type != 'task' then return new; end if;
    insert into public.activity_log (workspace_id, node_id, actor_id, action, payload)
    values (new.workspace_id, new.id, auth.uid(), 'task_created', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if new.type != 'task' then return new; end if;
    if (to_jsonb(new) - 'updated_at' - 'due_reminder_sent_at')
       is not distinct from (to_jsonb(old) - 'updated_at' - 'due_reminder_sent_at') then
      return new;
    end if;
    insert into public.activity_log (workspace_id, node_id, actor_id, action, payload)
    values (new.workspace_id, new.id, auth.uid(), 'task_updated',
            jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. automation_rules sin índice para su propio patrón de acceso.
--    apply_assign_on_create_automation/apply_status_change_automations
--    filtran por project_id+kind en CADA creación de tarea y CADA cambio
--    de estado de CUALQUIER tarea del workspace -- sequential scan de
--    toda la tabla en cada una de esas rutas de escritura frecuente.
--    Parcial (`where enabled`): las reglas desactivadas nunca las
--    consulta ninguna de las dos funciones.
-- ============================================================
create index idx_automation_rules_project_kind on public.automation_rules(project_id, kind) where enabled;

-- ============================================================
-- 3. Un proyecto archivado no lo hace invisible para Automatizaciones --
--    sus reglas (incluido due_reminder) seguían disparando indefinidamente
--    aunque el proyecto ya no aparezca en ninguna vista normal. Se agrega
--    el guard en las dos funciones que disparan desde un trigger; el
--    filtro del lado de sweepDueReminders (que no tiene trigger, corre
--    desde el cron) va en worker/automation-dispatch.ts.
-- ============================================================
create or replace function public.apply_assign_on_create_automation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_current_assignee uuid;
  v_target uuid;
  v_archived_at timestamptz;
begin
  select assignee_id into v_current_assignee from public.nodes where id = new.node_id;
  if v_current_assignee is not null then
    return new;
  end if;

  select archived_at into v_archived_at from public.nodes where id = new.container_id;
  if v_archived_at is not null then
    return new;
  end if;

  select target_user_id into v_target
  from public.automation_rules
  where project_id = new.container_id and kind = 'assign_on_create' and enabled and target_user_id is not null
  limit 1;

  if v_target is not null then
    insert into public.task_assignees (node_id, user_id, assigned_by)
    values (new.node_id, v_target, null)
    on conflict (node_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.apply_status_change_automations()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_container_id uuid;
  v_container_archived_at timestamptz;
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

  select archived_at into v_container_archived_at from public.nodes where id = v_container_id;
  if v_container_archived_at is not null then
    return new;
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
