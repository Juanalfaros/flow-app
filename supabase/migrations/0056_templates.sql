-- 0056_templates.sql — F5 #8: plantillas de tarea y de proyecto completo
-- (estados + campos personalizados). Alcance cerrado con el usuario:
-- "ambos" niveles.
--
-- `duplicate_task_node` (0047) y `create_project_with_defaults` (0008,
-- reescrita en 0036) ya prueban el patrón de clonado — acá se reusa el
-- mismo criterio (insert-select para labels, create_task_node para el
-- nodo) pero escribiendo a tablas de PLANTILLA (datos, desacoplados de
-- cualquier nodo vivo) en vez de crear un nodo de inmediato. 0047 aclaraba
-- explícitamente que esto quedaba fuera de su alcance — es lo que resuelve
-- esta migración.

-- ============================================================
-- 1. Tablas
-- ============================================================

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  title text not null,
  description text,
  priority text not null default 'medium',
  -- Referencias a labels.id (workspace-scoped, viven independientes de
  -- cualquier tarea) — no se snapshotea nombre/color, así que si la
  -- etiqueta cambia de color después de guardar la plantilla, la
  -- instancia nueva usa el color actual, no uno viejo. Al instanciar se
  -- filtra contra labels existentes (una etiqueta borrada después de
  -- guardar la plantilla simplemente no se copia, sin error).
  label_ids uuid[] not null default '{}',
  -- Un nivel de subtareas, mismo límite que el resto del esquema
  -- (create_task_node ya no permite anidar más de un nivel).
  -- [{title, priority, description}]
  subtasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_task_templates_workspace_id on public.task_templates(workspace_id);

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index idx_project_templates_workspace_id on public.project_templates(workspace_id);

create table public.project_template_statuses (
  template_id uuid not null references public.project_templates(id) on delete cascade,
  name text not null,
  status_kind text not null,
  position numeric not null,
  is_default boolean not null default false
);

create index idx_project_template_statuses_template_id on public.project_template_statuses(template_id);

create table public.project_template_custom_fields (
  template_id uuid not null references public.project_templates(id) on delete cascade,
  name text not null,
  field_type text not null,
  options jsonb,
  position numeric not null
);

create index idx_project_template_custom_fields_template_id on public.project_template_custom_fields(template_id);

create table public.project_template_tasks (
  template_id uuid not null references public.project_templates(id) on delete cascade,
  task_template_id uuid not null references public.task_templates(id) on delete cascade,
  -- Referencia por POSICIÓN, no por id: el estado nuevo recién se crea al
  -- instanciar (instantiate_project_template arma un mapa
  -- position -> nuevo status id sobre la marcha).
  status_position numeric not null,
  position numeric not null
);

create index idx_project_template_tasks_template_id on public.project_template_tasks(template_id);

-- ============================================================
-- 2. RLS — mismo criterio que `labels` (0003_rls.sql): tablas
--    workspace-scoped sin pasar por `nodes`, `for all` + is_member_of.
--    Las 3 tablas hijas de project_templates no tienen workspace_id
--    directo — se resuelve vía el template padre.
-- ============================================================

alter table public.task_templates enable row level security;
create policy "task_templates_all_member" on public.task_templates
  for all to authenticated
  using (public.is_member_of(workspace_id)) with check (public.is_member_of(workspace_id));

alter table public.project_templates enable row level security;
create policy "project_templates_all_member" on public.project_templates
  for all to authenticated
  using (public.is_member_of(workspace_id)) with check (public.is_member_of(workspace_id));

alter table public.project_template_statuses enable row level security;
create policy "project_template_statuses_all_member" on public.project_template_statuses
  for all to authenticated using (
    exists (select 1 from public.project_templates pt
            where pt.id = project_template_statuses.template_id and public.is_member_of(pt.workspace_id))
  ) with check (
    exists (select 1 from public.project_templates pt
            where pt.id = project_template_statuses.template_id and public.is_member_of(pt.workspace_id))
  );

alter table public.project_template_custom_fields enable row level security;
create policy "project_template_custom_fields_all_member" on public.project_template_custom_fields
  for all to authenticated using (
    exists (select 1 from public.project_templates pt
            where pt.id = project_template_custom_fields.template_id and public.is_member_of(pt.workspace_id))
  ) with check (
    exists (select 1 from public.project_templates pt
            where pt.id = project_template_custom_fields.template_id and public.is_member_of(pt.workspace_id))
  );

alter table public.project_template_tasks enable row level security;
create policy "project_template_tasks_all_member" on public.project_template_tasks
  for all to authenticated using (
    exists (select 1 from public.project_templates pt
            where pt.id = project_template_tasks.template_id and public.is_member_of(pt.workspace_id))
  ) with check (
    exists (select 1 from public.project_templates pt
            where pt.id = project_template_tasks.template_id and public.is_member_of(pt.workspace_id))
  );

-- ============================================================
-- 3. save_task_as_template — snapshotea una tarea existente
-- ============================================================
create function public.save_task_as_template(p_task_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_src public.nodes%rowtype;
  v_template_id uuid;
  v_subtasks jsonb;
begin
  select * into v_src from public.nodes where id = p_task_id and type = 'task';
  if not found then
    raise exception 'tarea % no existe', p_task_id;
  end if;
  perform public.assert_member_of(v_src.workspace_id);
  perform public.assert_can_access_node(p_task_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'title', s.title, 'priority', s.priority, 'description', s.description
  )), '[]'::jsonb)
  into v_subtasks
  from public.nodes s where s.parent_id = p_task_id and s.type = 'task';

  insert into public.task_templates (workspace_id, name, title, description, priority, label_ids, subtasks)
  values (
    v_src.workspace_id, p_name, v_src.title, v_src.description, v_src.priority,
    (select coalesce(array_agg(label_id), '{}'::uuid[]) from public.task_labels where node_id = p_task_id),
    v_subtasks
  )
  returning id into v_template_id;

  return v_template_id;
end;
$$;

revoke execute on function public.save_task_as_template(uuid, text) from public, anon;
grant execute on function public.save_task_as_template(uuid, text) to authenticated;

-- ============================================================
-- 4. instantiate_task_template — crea una tarea viva desde la plantilla
-- ============================================================
create function public.instantiate_task_template(
  p_template_id uuid, p_container_id uuid, p_status_id uuid, p_position numeric
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tpl public.task_templates%rowtype;
  v_workspace_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_new_sub_id uuid;
  v_sub jsonb;
begin
  select * into v_tpl from public.task_templates where id = p_template_id;
  if not found then
    raise exception 'plantilla % no existe', p_template_id;
  end if;
  perform public.assert_member_of(v_tpl.workspace_id);

  select workspace_id into v_workspace_id from public.nodes where id = p_container_id and type = 'project';
  if v_workspace_id is distinct from v_tpl.workspace_id then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public.assert_can_access_node(p_container_id);

  perform public.create_task_node(v_new_id, p_container_id, v_tpl.title, p_status_id, p_position, v_tpl.priority);
  update public.nodes set description = v_tpl.description where id = v_new_id;

  -- Filtra contra labels que sigan existiendo — ver comentario de
  -- task_templates.label_ids más arriba.
  insert into public.task_labels (node_id, label_id)
    select v_new_id, l.id from public.labels l where l.id = any(v_tpl.label_ids);

  for v_sub in select * from jsonb_array_elements(v_tpl.subtasks) loop
    v_new_sub_id := gen_random_uuid();
    perform public.create_task_node(
      v_new_sub_id, p_container_id, v_sub->>'title', p_status_id, 0,
      coalesce(v_sub->>'priority', 'medium'), null, null, v_new_id
    );
    update public.nodes set description = v_sub->>'description' where id = v_new_sub_id;
  end loop;

  return v_new_id;
end;
$$;

revoke execute on function public.instantiate_task_template(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.instantiate_task_template(uuid, uuid, uuid, numeric) to authenticated;

-- ============================================================
-- 5. save_project_as_template — snapshotea estados + campos
--    personalizados + tareas top-level (cada una vía save_task_as_template)
-- ============================================================
create function public.save_project_as_template(p_project_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_task record;
  v_task_template_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_project_id and type = 'project';
  if v_workspace_id is null then
    raise exception 'lista % no existe', p_project_id;
  end if;
  perform public.assert_member_of(v_workspace_id);
  perform public.assert_can_access_node(p_project_id);

  insert into public.project_templates (workspace_id, name)
  values (v_workspace_id, p_name)
  returning id into v_template_id;

  insert into public.project_template_statuses (template_id, name, status_kind, position, is_default)
  select v_template_id, name, status_kind, position, is_default
  from public.statuses where project_id = p_project_id;

  insert into public.project_template_custom_fields (template_id, name, field_type, options, position)
  select v_template_id, name, field_type, options, position
  from public.project_custom_fields where project_id = p_project_id;

  -- Tareas top-level del proyecto (sin parent_id — las subtareas ya viajan
  -- DENTRO de cada task_template vía save_task_as_template).
  for v_task in
    select n.id, n.title, s.position as status_position
    from public.nodes n
    join public.node_memberships nm on nm.node_id = n.id and nm.container_id = p_project_id
    join public.statuses s on s.id = n.status_id
    where n.type = 'task' and n.parent_id is null
  loop
    v_task_template_id := public.save_task_as_template(v_task.id, v_task.title);
    insert into public.project_template_tasks (template_id, task_template_id, status_position, position)
    values (v_template_id, v_task_template_id, v_task.status_position, 0);
  end loop;

  return v_template_id;
end;
$$;

revoke execute on function public.save_project_as_template(uuid, text) from public, anon;
grant execute on function public.save_project_as_template(uuid, text) to authenticated;

-- ============================================================
-- 6. instantiate_project_template — crea un proyecto vivo desde la
--    plantilla: estados, campos personalizados, y cada tarea vinculada
--    (vía instantiate_task_template)
-- ============================================================
create function public.instantiate_project_template(p_template_id uuid, p_space_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tpl public.project_templates%rowtype;
  v_workspace_id uuid;
  v_project_id uuid;
  v_status_row record;
  v_new_status_id uuid;
  v_status_map jsonb := '{}'::jsonb;
  v_default_status_id uuid;
  v_field_row record;
  v_link record;
  v_position numeric := 0;
begin
  select * into v_tpl from public.project_templates where id = p_template_id;
  if not found then
    raise exception 'plantilla % no existe', p_template_id;
  end if;
  perform public.assert_member_of(v_tpl.workspace_id);

  select workspace_id into v_workspace_id from public.nodes where id = p_space_id and type in ('space', 'folder');
  if v_workspace_id is distinct from v_tpl.workspace_id then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform public.assert_can_access_node(p_space_id);

  insert into public.nodes (workspace_id, parent_id, type, title, created_by)
  values (v_workspace_id, p_space_id, 'project', p_name, auth.uid())
  returning id into v_project_id;

  for v_status_row in
    select * from public.project_template_statuses where template_id = p_template_id order by position
  loop
    insert into public.statuses (project_id, name, status_kind, position, is_default)
    values (v_project_id, v_status_row.name, v_status_row.status_kind, v_status_row.position, v_status_row.is_default)
    returning id into v_new_status_id;
    v_status_map := v_status_map || jsonb_build_object(v_status_row.position::text, v_new_status_id);
    if v_status_row.is_default then v_default_status_id := v_new_status_id; end if;
  end loop;

  -- Plantilla armada sin ningún estado (caso raro, ej. proyecto fuente sin
  -- estados al momento de guardarla) — mismo default de siempre, para no
  -- dejar un proyecto sin ningún estado utilizable.
  if v_default_status_id is null then
    insert into public.statuses (project_id, name, status_kind, position, is_default)
    values (v_project_id, 'Por hacer', 'neutral', 0, true)
    returning id into v_default_status_id;
  end if;

  for v_field_row in
    select * from public.project_template_custom_fields where template_id = p_template_id order by position
  loop
    insert into public.project_custom_fields (project_id, name, field_type, options, position)
    values (v_project_id, v_field_row.name, v_field_row.field_type, v_field_row.options, v_field_row.position);
  end loop;

  for v_link in select * from public.project_template_tasks where template_id = p_template_id loop
    v_new_status_id := coalesce((v_status_map ->> v_link.status_position::text)::uuid, v_default_status_id);
    perform public.instantiate_task_template(v_link.task_template_id, v_project_id, v_new_status_id, v_position);
    v_position := v_position + 1;
  end loop;

  return v_project_id;
end;
$$;

revoke execute on function public.instantiate_project_template(uuid, uuid, text) from public, anon;
grant execute on function public.instantiate_project_template(uuid, uuid, text) to authenticated;

comment on table public.task_templates is
  'Plantillas de tarea reutilizables, desacopladas de cualquier nodo vivo (F5 #8). Ver save_task_as_template/instantiate_task_template.';
comment on table public.project_templates is
  'Plantillas de proyecto (estados + campos personalizados + tareas vinculadas), F5 #8. Ver save_project_as_template/instantiate_project_template.';
