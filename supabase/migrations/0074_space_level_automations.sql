-- 0074_space_level_automations.sql — Automatizaciones de espacio: una
-- regla configurada UNA sola vez en el espacio dispara en cualquier
-- proyecto de ese espacio, incluidos los que se creen después (decisión
-- tomada con el usuario: no un atajo de UI que solo abra el diálogo de un
-- proyecto elegido, la regla debe aplicar sola). Depende de
-- 0073_space_level_fields.sql ("Estados de tarea de espacio"): sin eso,
-- "cuando una tarea entra a Hecho, avisar" no tendría un estado que
-- signifique lo mismo en todos los proyectos del espacio.
--
-- `automation_rules` tiene SU PROPIO trigger de tipo
-- (enforce_automation_rule_project_type, 0063) — separado del que 0073 ya
-- relajó para `statuses`/`project_custom_fields`, así que hay que
-- relajarlo acá también con el mismo criterio.

create or replace function public.enforce_automation_rule_project_type()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.nodes where id = new.project_id and type in ('project', 'space')) then
    raise exception 'automation_rules.project_id (%) debe referenciar un nodo type=project o type=space', new.project_id;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 1. assign_on_create — no depende de status_id, el match es directo:
--    el project_id de la regla es el container de la tarea nueva O el
--    espacio raíz de esa tarea. Si hay una regla de proyecto Y una de
--    espacio a la vez, la de proyecto gana (más específica) — mismo
--    criterio de "lo más cercano a la tarea manda" que ya usa el resto
--    de la app (ej. campos personalizados heredados vs. propios).
-- ============================================================
create or replace function public.apply_assign_on_create_automation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_current_assignee uuid;
  v_space_id uuid;
  v_target uuid;
begin
  select assignee_id into v_current_assignee from public.nodes where id = new.node_id;
  -- `new.node_id`.space_id TODAVÍA es null acá: para una tarea top-level
  -- (sin parent_id) lo resuelve trg_set_membership_space_id (0028), otro
  -- trigger AFTER INSERT sobre esta misma tabla que Postgres corre en
  -- orden ALFABÉTICO por nombre — "trg_assign_on_create_automation" va
  -- antes que "trg_set_membership_space_id", así que este trigger
  -- siempre se adelanta. Se resuelve el espacio desde el CONTAINER en su
  -- lugar (el proyecto ya existe de antes, su space_id ya está poblado
  -- hace rato, sin esta dependencia de orden).
  select space_id into v_space_id from public.nodes where id = new.container_id;
  if v_current_assignee is not null then
    -- Ya tiene responsable (a mano o por parámetro) — la automatización
    -- nunca pisa una asignación explícita.
    return new;
  end if;

  select target_user_id into v_target
  from public.automation_rules
  where kind = 'assign_on_create' and enabled and target_user_id is not null
    and (project_id = new.container_id or project_id = v_space_id)
  order by (project_id = new.container_id) desc
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

-- ============================================================
-- 2. notify_on_status / label_on_status — acá NO se puede comparar
--    `status_id` 1 a 1 entre una regla de espacio y una tarea de
--    cualquier proyecto: cada proyecto tiene su PROPIA copia de estados,
--    con su propio id (incluso los heredados por 0073 son copias con ids
--    nuevos, no la misma fila). Se compara por NOMBRE del estado en su
--    lugar: el `status_id` de una regla de espacio apunta a la plantilla
--    del espacio, y matchea cualquier tarea de ESE espacio cuyo estado
--    actual tenga el mismo nombre que esa plantilla — nunca cruza a otro
--    espacio, porque además exige `project_id = new.space_id`.
--    `label_id` no necesita este rodeo: las etiquetas ya son por
--    workspace entero (0001_init.sql), no por proyecto.
-- ============================================================
create or replace function public.apply_status_change_automations()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_container_id uuid;
  v_status_name text;
  v_rule record;
  v_member record;
begin
  if new.type != 'task' or new.status_id is not distinct from old.status_id then
    return new;
  end if;

  select container_id into v_container_id from public.node_memberships where node_id = new.id;
  if v_container_id is null then
    return new; -- subtarea: no tiene container propio, no le aplican reglas de proyecto/espacio
  end if;

  select name into v_status_name from public.statuses where id = new.status_id;

  for v_rule in
    select * from public.automation_rules
    where enabled and kind in ('notify_on_status', 'label_on_status')
      and (
        -- Regla de proyecto: mismo criterio exacto de siempre.
        (project_id = v_container_id and status_id = new.status_id)
        -- Regla de espacio: match por nombre contra la plantilla del espacio.
        or (
          project_id = new.space_id
          and status_id in (select id from public.statuses where project_id = new.space_id and name = v_status_name)
        )
      )
  loop
    if v_rule.kind = 'label_on_status' then
      insert into public.task_labels (node_id, label_id)
      values (new.id, v_rule.label_id)
      on conflict do nothing;
    elsif v_rule.kind = 'notify_on_status' then
      if v_rule.notify_whole_project then
        -- "Todo el proyecto" = cada miembro del workspace con acceso real
        -- a este proyecto (respeta espacios/proyectos privados vía
        -- can_user_access_node) — mismo criterio de siempre, tanto para
        -- una regla de proyecto como para una de espacio (el "proyecto"
        -- relevante sigue siendo el container real de la tarea, nunca el
        -- espacio entero).
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
