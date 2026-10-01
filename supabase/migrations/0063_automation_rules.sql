-- 0063_automation_rules.sql — Automatizaciones (menú de proyecto), motor
-- de reglas fijas elegido con el usuario: no un builder libre, 4
-- combinaciones "cuando pasa esto → hacer esto" configurables por
-- proyecto.
--
--   - assign_on_create: al crear una tarea sin responsable en este
--     proyecto, asignarla a una persona fija.
--   - notify_on_status: al entrar a un estado elegido, notificar a una
--     persona o a todo el proyecto.
--   - label_on_status: al entrar a un estado elegido, agregar una
--     etiqueta fija.
--   - due_reminder: si una tarea vence sin completarse, notificar al
--     responsable al día siguiente (la única que no dispara desde un
--     trigger — corre desde un cron de Cloudflare, ver
--     worker/automation-dispatch.ts, porque este repo no tiene pg_cron).

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.nodes(id) on delete cascade,
  kind text not null check (kind in ('assign_on_create', 'notify_on_status', 'due_reminder', 'label_on_status')),
  -- Estado disparador — obligatorio para notify_on_status/label_on_status,
  -- null para assign_on_create/due_reminder (no dependen de un estado).
  status_id uuid references public.statuses(id) on delete cascade,
  -- Persona objetivo — assign_on_create siempre la usa; notify_on_status
  -- la usa solo si notify_whole_project es false.
  target_user_id uuid references public.profiles(id) on delete set null,
  notify_whole_project boolean not null default false,
  -- Etiqueta objetivo — solo label_on_status.
  label_id uuid references public.labels(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (kind = 'assign_on_create' and status_id is null and label_id is null)
    or (kind = 'notify_on_status' and status_id is not null and label_id is null)
    or (kind = 'due_reminder' and status_id is null and target_user_id is null and label_id is null and not notify_whole_project)
    or (kind = 'label_on_status' and status_id is not null and label_id is not null and target_user_id is null and not notify_whole_project)
  )
);

-- Mismo shape que enforce_custom_field_project_type (0048): project_id
-- debe apuntar a un nodo type='project', una FK simple no lo expresa.
create function public.enforce_automation_rule_project_type()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.nodes where id = new.project_id and type = 'project') then
    raise exception 'automation_rules.project_id (%) debe referenciar un nodo type=project', new.project_id;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_automation_rule_project_type
  before insert or update of project_id on public.automation_rules
  for each row execute function public.enforce_automation_rule_project_type();

alter table public.automation_rules enable row level security;

-- Mismo criterio que project_custom_fields_access (0048): todo miembro
-- con acceso al proyecto administra sus reglas.
create policy "automation_rules_access" on public.automation_rules
  for all to authenticated using (
    exists (select 1 from public.nodes n where n.id = automation_rules.project_id and public.can_access_node(n.id))
  ) with check (
    exists (select 1 from public.nodes n where n.id = automation_rules.project_id and public.can_access_node(n.id))
  );

-- Idempotencia de due_reminder — mismo criterio que notifications.pushed_at
-- (0050): NULL = nunca se avisó, se compara contra la fecha de hoy para
-- que no repita ("al día siguiente" es un aviso único, no un recordatorio
-- diario).
alter table public.nodes add column due_reminder_sent_at date;

-- ============================================================
-- 1. assign_on_create — trigger sobre node_memberships, no sobre nodes:
--    node_memberships se inserta DESPUÉS del nodo dentro de
--    create_task_node (0036), así que es el único punto donde container_id
--    ya existe Y la tarea recién creada también — enganchar en
--    activity_log/nodes habría corrido antes de que node_memberships
--    tuviera la fila (mismo tipo de trampa de orden que ya causó el bug
--    real de nodes_access esta semana).
-- ============================================================
create function public.apply_assign_on_create_automation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_current_assignee uuid;
  v_target uuid;
begin
  select assignee_id into v_current_assignee from public.nodes where id = new.node_id;
  if v_current_assignee is not null then
    -- Ya tiene responsable (a mano o por parámetro) — la automatización
    -- nunca pisa una asignación explícita.
    return new;
  end if;

  select target_user_id into v_target
  from public.automation_rules
  where project_id = new.container_id and kind = 'assign_on_create' and enabled and target_user_id is not null
  limit 1;

  if v_target is not null then
    -- Dispara trg_sync_assignee_id_to_task_assignees (0041, promueve a
    -- principal) y trg_notify_from_task_assignee (0042, notifica) solo —
    -- ninguna lógica de asignación/notificación se reimplementa acá.
    insert into public.task_assignees (node_id, user_id, assigned_by)
    values (new.node_id, v_target, null)
    on conflict (node_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_assign_on_create_automation
  after insert on public.node_memberships
  for each row execute function public.apply_assign_on_create_automation();

-- ============================================================
-- 2. notify_on_status / label_on_status — trigger sobre nodes, dispara
--    cuando status_id cambia en una tarea. Acá node_memberships SÍ existe
--    ya (la tarea no es nueva), así que no hay el problema de orden de
--    arriba.
-- ============================================================
create function public.apply_status_change_automations()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_container_id uuid;
  v_rule record;
  v_recipient uuid;
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
        -- "Todo el proyecto" = cada miembro del workspace con acceso real
        -- a este proyecto (respeta espacios/proyectos privados vía
        -- can_user_access_node, 0037) — no hay una tabla de "miembros del
        -- proyecto" separada de eso.
        for v_member in select user_id from public.memberships where workspace_id = new.workspace_id loop
          if v_member.user_id != auth.uid() and public.can_user_access_node(v_member.user_id, v_container_id) then
            insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
            values (new.workspace_id, v_member.user_id, auth.uid(), new.id, 'status_changed',
                    jsonb_build_object('automation_rule_id', v_rule.id, 'after_status_id', new.status_id));
          end if;
        end loop;
      elsif v_rule.target_user_id is not null and v_rule.target_user_id != auth.uid() then
        insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
        values (new.workspace_id, v_rule.target_user_id, auth.uid(), new.id, 'status_changed',
                jsonb_build_object('automation_rule_id', v_rule.id, 'after_status_id', new.status_id));
      end if;
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_status_change_automations
  after update of status_id on public.nodes
  for each row execute function public.apply_status_change_automations();
