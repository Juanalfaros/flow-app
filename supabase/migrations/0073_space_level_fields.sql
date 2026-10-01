-- 0073_space_level_fields.sql — "Estados de tarea de espacio" y "Campos
-- personalizados de espacio" (menú de espacio, NodeTreeItem.tsx, hasta acá
-- "Pronto"). Decisión con el usuario: herencia automática — un proyecto
-- nuevo creado dentro de un espacio que ya tiene sus propios estados/campos
-- arranca con una COPIA de esos (ids propios, independiente desde ahí),
-- solo hacia adelante, nunca retroactivo (mismo criterio que el resto de
-- "seed solo al crear" de create_project_with_defaults).
--
-- Cero tablas nuevas: `statuses` y `project_custom_fields` ya tienen
-- exactamente la forma que hace falta (name/status_kind/position para uno,
-- name/field_type/options/position para el otro), y `nodes.space_id`
-- (0028) ya resuelve "espacio raíz" para cualquier nodo con un solo hop de
-- índice. Se reusan las DOS tablas de siempre, solo se relaja su trigger de
-- tipo para aceptar además `type='space'` en `project_id`.
--
-- Importante: una fila `statuses`/`project_custom_fields` con project_id
-- apuntando a un espacio NUNCA la referencia una tarea directamente — las
-- tareas siempre viven dentro de un proyecto (node_memberships.container_id
-- es siempre type='project'), nunca directo en un espacio. Estas filas son
-- puramente la PLANTILLA que se copia al crear un proyecto nuevo; por eso
-- StatusSettingsDialog/CustomFieldDefinitionDialog (reusados tal cual para
-- el espacio, ver PR de cliente) no necesitan el flujo de "reasignar tareas
-- antes de borrar" cuando operan sobre un espacio: no hay tareas que
-- reasignar, nunca las hay.

-- ============================================================
-- 1. Relajar los triggers de tipo: project_id ahora acepta
--    type='project' O type='space' (antes solo 'project').
-- ============================================================
create or replace function public.enforce_status_project_type()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.nodes where id = new.project_id and type in ('project', 'space')) then
    raise exception 'statuses.project_id (%) debe referenciar un nodo type=project o type=space', new.project_id;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_custom_field_project_type()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.nodes where id = new.project_id and type in ('project', 'space')) then
    raise exception 'project_custom_fields.project_id (%) debe referenciar un nodo type=project o type=space', new.project_id;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. create_project_with_defaults (última definición: 0036) — hereda de
--    las plantillas del espacio raíz si existen, si no cae en el mismo
--    fallback fijo de siempre (3 estados, cero campos personalizados) —
--    comportamiento idéntico al de antes de esta migración para cualquier
--    espacio que no haya configurado sus propias plantillas.
-- ============================================================
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

  -- Campos personalizados: sin fallback fijo (a diferencia de los estados
  -- de arriba) — si el espacio no tiene campos propios, el proyecto
  -- arranca sin ninguno, igual que siempre antes de esta migración.
  insert into public.project_custom_fields (project_id, name, field_type, options, position)
  select v_project_id, name, field_type, options, position
  from public.project_custom_fields where project_id = v_space_id;

  return v_project_id;
end;
$$;
