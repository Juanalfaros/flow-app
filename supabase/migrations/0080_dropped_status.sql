-- 0080_dropped_status.sql — Fase 1 de "Cerrar con subtareas abiertas"
-- (decisión de producto discutida y aprobada con el usuario, ver
-- artifact "Cerrar con subtareas abiertas"): un tercer estado de tarea,
-- "Descartado", distinto de "Hecho" — no es un matiz de completada, es
-- "se decidió no hacerla". No suma al progreso ni cuenta como completada
-- en ninguna métrica (eso lo resuelve el cliente vía isClosedStatus/
-- isDoneStatus en status-kind.ts, no esta migración), pero necesita
-- existir como `status_kind` real para que el diálogo de cierre (Fase 2,
-- todavía no implementada) tenga un destino a dónde mover las subtareas
-- descartadas.

alter table public.statuses drop constraint statuses_status_kind_check;
alter table public.statuses
  add constraint statuses_status_kind_check
  check (status_kind in ('neutral', 'success', 'warning', 'danger', 'dropped'));

-- create_project_with_defaults (última definición: 0073) — se agrega un
-- paso final que garantiza un estado 'dropped' en TODO proyecto nuevo,
-- exista o no en la plantilla del espacio de origen (la rama
-- `v_has_space_statuses` copia lo que el espacio tenga, que podría no
-- incluirlo si se configuró antes de esta migración).
create or replace function public.create_project_with_defaults(p_parent_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_project_id uuid;
  v_workspace_id uuid;
  v_space_id uuid;
  v_has_space_statuses boolean;
begin
  select workspace_id, space_id into v_workspace_id, v_space_id from public.nodes
  where id = p_parent_id and type in ('space', 'folder');
  if v_workspace_id is null then
    raise exception 'parent % no existe o no es de tipo space/folder', p_parent_id;
  end if;
  perform public.assert_member_of(v_workspace_id);
  perform public.assert_can_access_node(p_parent_id);

  insert into public.nodes (workspace_id, parent_id, type, title, created_by)
  values (v_workspace_id, p_parent_id, 'project', p_name, auth.uid())
  returning id into v_project_id;

  select exists(select 1 from public.statuses where project_id = v_space_id) into v_has_space_statuses;

  if v_has_space_statuses then
    insert into public.statuses (project_id, name, status_kind, position, is_default)
    select v_project_id, name, status_kind, position, is_default
    from public.statuses where project_id = v_space_id;
  else
    insert into public.statuses (project_id, name, status_kind, position, is_default)
    values
      (v_project_id, 'Por hacer',   'neutral', 0, true),
      (v_project_id, 'En progreso', 'neutral', 1, false),
      (v_project_id, 'Hecho',       'success', 2, false);
  end if;

  if not exists (select 1 from public.statuses where project_id = v_project_id and status_kind = 'dropped') then
    insert into public.statuses (project_id, name, status_kind, position, is_default)
    select v_project_id, 'Descartada', 'dropped', coalesce(max(position), 0) + 1, false
    from public.statuses where project_id = v_project_id;
  end if;

  return v_project_id;
end;
$$;

-- Backfill: un solo insert cubre proyectos existentes Y plantillas de
-- espacio (0073) por igual — `group by project_id` sobre TODA la tabla,
-- sin distinguir type='project' de type='space', porque a las dos les
-- aplica el mismo criterio ("si ya tiene estados pero ninguno es
-- 'dropped', le falta el suyo").
insert into public.statuses (project_id, name, status_kind, position, is_default)
select s.project_id, 'Descartada', 'dropped', coalesce(max(s.position), 0) + 1, false
from public.statuses s
where not exists (
  select 1 from public.statuses s2 where s2.project_id = s.project_id and s2.status_kind = 'dropped'
)
group by s.project_id;
