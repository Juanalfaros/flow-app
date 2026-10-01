-- 0067_security_fixes.sql — 4 fixes de severidad crítica/alta encontrados
-- en una auditoría de seguridad extensa (2026-09-09). Van juntos en una
-- sola migración chica a propósito: es el PR de mayor prioridad de toda
-- la auditoría, deployado antes que cualquier otra cosa.

-- ============================================================
-- 1. CRÍTICO — automation_rules.target_user_id/label_id sin validar
--    workspace: fuga de datos entre workspaces.
--
--    La tabla (0063_automation_rules.sql) solo tenía FKs simples a
--    profiles(id)/labels(id) — nunca se validaba que pertenecieran al
--    mismo workspace que project_id. Ni la RLS (automation_rules_access
--    solo valida can_access_node(project_id) para quien CREA la regla,
--    nunca para el destinatario) ni las funciones security definer que
--    las consumen (bypasean RLS) lo chequeaban. Cualquier miembro con
--    acceso a un proyecto podía crear una regla notify_on_status con
--    target_user_id = el uuid de CUALQUIER usuario de la instancia —
--    cuando dispara, inserta una notificación real, y el pipeline de
--    push/email (Service Role) resuelve título de tarea/nombre del
--    actor/email real y se lo entrega a un desconocido fuera del
--    workspace. Vía assign_on_create la fuga además queda persistente
--    (la persona queda como responsable, sigue recibiendo avisos).
--
--    Mismo patrón que enforce_automation_rule_project_type (misma
--    migración de origen): un único trigger de validación, para no
--    duplicar el chequeo dentro de las funciones que ya confían en la
--    fila una vez insertada.
-- ============================================================
create function public.enforce_automation_rule_targets()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = new.project_id;

  if new.target_user_id is not null and not exists (
    select 1 from public.memberships
    where workspace_id = v_workspace_id and user_id = new.target_user_id
  ) then
    raise exception 'automation_rules.target_user_id (%) no es miembro de este workspace', new.target_user_id;
  end if;

  if new.label_id is not null and not exists (
    select 1 from public.labels where id = new.label_id and workspace_id = v_workspace_id
  ) then
    raise exception 'automation_rules.label_id (%) no pertenece a este workspace', new.label_id;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_automation_rule_targets
  before insert or update of target_user_id, label_id on public.automation_rules
  for each row execute function public.enforce_automation_rule_targets();

-- ============================================================
-- 2. ALTO — archive_node/unarchive_node reintroducían el bug que 0036 ya
--    había cerrado para las otras 7 RPCs de nodos: solo validaban
--    is_member_of(workspace_id), nunca assert_can_access_node(p_node_id)
--    — cualquier miembro del workspace podía archivar/restaurar un
--    espacio o proyecto privado ajeno con solo conocer su uuid.
-- ============================================================
create or replace function public.archive_node(p_node_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.nodes n
    where n.id = p_node_id and public.is_member_of(n.workspace_id)
  ) then
    raise exception 'No tenés acceso a este nodo';
  end if;
  perform public.assert_can_access_node(p_node_id);

  with recursive subtree as (
    select id from public.nodes where id = p_node_id
    union all
    select n.id from public.nodes n join subtree s on n.parent_id = s.id
  )
  update public.nodes set archived_at = now()
  where id in (select id from subtree) and archived_at is null;
end;
$$;

create or replace function public.unarchive_node(p_node_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.nodes n
    where n.id = p_node_id and public.is_member_of(n.workspace_id)
  ) then
    raise exception 'No tenés acceso a este nodo';
  end if;
  perform public.assert_can_access_node(p_node_id);

  with recursive subtree as (
    select id from public.nodes where id = p_node_id
    union all
    select n.id from public.nodes n join subtree s on n.parent_id = s.id
  )
  update public.nodes set archived_at = null
  where id in (select id from subtree);
end;
$$;

-- ============================================================
-- 3. MEDIO — duplicate_space validaba acceso a la raíz (p_space_id) pero
--    nunca a cada nodo descendiente antes de clonarlo. Un proyecto
--    anidado privado SIN tareas no disparaba ningún error (con tareas,
--    duplicate_task_node ya revienta y hace rollback) — su nombre,
--    estados y campos personalizados terminaban clonados en el espacio
--    nuevo de quien no tenía acceso.
-- ============================================================
create or replace function public.duplicate_space(p_space_id uuid, p_new_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_new_space_id uuid := gen_random_uuid();
  v_row record;
  v_new_id uuid;
  v_new_parent_id uuid;
  v_status record;
  v_new_status_id uuid;
  v_field record;
  v_task record;
  v_new_status_for_task uuid;
begin
  select workspace_id into v_workspace_id from public.nodes
  where id = p_space_id and type = 'space';
  if v_workspace_id is null then
    raise exception 'espacio % no existe', p_space_id;
  end if;
  perform public.assert_member_of(v_workspace_id);
  perform public.assert_can_access_node(p_space_id);

  create temporary table tmp_node_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  create temporary table tmp_status_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  insert into public.nodes (id, workspace_id, parent_id, type, title, created_by)
  values (v_new_space_id, v_workspace_id, null, 'space', p_new_name, auth.uid());
  insert into tmp_node_map (old_id, new_id) values (p_space_id, v_new_space_id);

  for v_row in (
    with recursive subtree as (
      select id, parent_id, type, title, 0 as depth from public.nodes where id = p_space_id
      union all
      select n.id, n.parent_id, n.type, n.title, s.depth + 1
      from public.nodes n join subtree s on n.parent_id = s.id
    )
    select * from subtree where id <> p_space_id order by depth
  ) loop
    -- Fix de seguridad: valida acceso a CADA descendiente antes de
    -- clonarlo, no solo a la raíz — un nodo privado sin tareas antes
    -- pasaba de largo sin ningún chequeo.
    perform public.assert_can_access_node(v_row.id);

    v_new_id := gen_random_uuid();
    select new_id into v_new_parent_id from tmp_node_map where old_id = v_row.parent_id;

    insert into public.nodes (id, workspace_id, parent_id, type, title, created_by)
    values (v_new_id, v_workspace_id, v_new_parent_id, v_row.type, v_row.title, auth.uid());
    insert into tmp_node_map (old_id, new_id) values (v_row.id, v_new_id);

    if v_row.type = 'project' then
      for v_status in select * from public.statuses where project_id = v_row.id order by position loop
        v_new_status_id := gen_random_uuid();
        insert into public.statuses (id, project_id, name, status_kind, position, is_default)
        values (v_new_status_id, v_new_id, v_status.name, v_status.status_kind, v_status.position, v_status.is_default);
        insert into tmp_status_map (old_id, new_id) values (v_status.id, v_new_status_id);
      end loop;

      for v_field in select * from public.project_custom_fields where project_id = v_row.id loop
        insert into public.project_custom_fields (project_id, name, field_type, options, position)
        values (v_new_id, v_field.name, v_field.field_type, v_field.options, v_field.position);
      end loop;

      for v_task in
        select nm.node_id, nm.position, n.status_id
        from public.node_memberships nm
        join public.nodes n on n.id = nm.node_id
        where nm.container_id = v_row.id
      loop
        select new_id into v_new_status_for_task from tmp_status_map where old_id = v_task.status_id;
        perform public.duplicate_task_node(v_task.node_id, v_new_id, v_new_status_for_task, v_task.position);
      end loop;
    end if;
  end loop;

  return v_new_space_id;
end;
$$;

-- ============================================================
-- 4. Defensa en profundidad — notifications_select_own (0016) solo
--    validaba recipient_id = auth.uid(), nunca membresía al workspace.
--    No cambia nada para el uso legítimo (todo recipient real ya es
--    miembro por construcción); cierra el canal de lectura si algún
--    camino futuro repitiera el mismo error de validación que el punto 1.
-- ============================================================
drop policy "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid() and public.is_member_of(workspace_id));
