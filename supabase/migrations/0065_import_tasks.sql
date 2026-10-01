-- 0065_import_tasks.sql — Importaciones (CSV), espejo inverso de la
-- exportación de F5 #4. La resolución de nombres (estado/responsable/
-- etiqueta) pasa por el CLIENTE, no por esta RPC: `ImportTasksDialog`
-- necesita mostrar un preview "resuelto/no resuelto" fila por fila ANTES
-- de confirmar, así que ya tiene que haber buscado cada nombre contra
-- statuses/memberships/labels del proyecto para poder pintar ese preview
-- — resolverlo de nuevo acá sería repetir el mismo trabajo. Esta RPC
-- recibe ids ya resueltos (o null) y solo hace el insert masivo, mismo
-- criterio multi-fila-por-llamada que create_project_with_defaults.
--
-- Como es `security definer` (bypassea RLS), valida que cada
-- status_id/assignee_id/label_id realmente pertenezca al proyecto/
-- workspace de destino antes de usarlo — un cliente comprometido no
-- podría, por ejemplo, colarle a una tarea nueva un label_id de otro
-- workspace solo porque lo mandó en el payload.

create function public.import_tasks(p_container_id uuid, p_rows jsonb)
returns setof uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_default_status_id uuid;
  v_position numeric;
  v_row jsonb;
  v_status_id uuid;
  v_assignee_id uuid;
  v_label_id uuid;
  v_new_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_container_id and type = 'project';
  if v_workspace_id is null then
    raise exception 'container % no existe o no es de tipo project', p_container_id;
  end if;
  perform public.assert_member_of(v_workspace_id);
  perform public.assert_can_access_node(p_container_id);

  select id into v_default_status_id from public.statuses
  where project_id = p_container_id order by (not is_default), position limit 1;
  if v_default_status_id is null then
    raise exception 'el proyecto % no tiene ningún estado', p_container_id;
  end if;

  select coalesce(max(position), 0) into v_position from public.node_memberships where container_id = p_container_id;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_position := v_position + 1000;

    -- status_id: se acepta solo si es de ESTE proyecto; si no, cae al
    -- default (mismo criterio que "no matcheó, usa el estado por
    -- defecto" de la fase de resolución del cliente).
    v_status_id := null;
    if v_row->>'status_id' is not null then
      select id into v_status_id from public.statuses
      where id = (v_row->>'status_id')::uuid and project_id = p_container_id;
    end if;
    if v_status_id is null then v_status_id := v_default_status_id; end if;

    -- assignee_id: se acepta solo si es miembro de este workspace.
    v_assignee_id := null;
    if v_row->>'assignee_id' is not null then
      select m.user_id into v_assignee_id from public.memberships m
      where m.user_id = (v_row->>'assignee_id')::uuid and m.workspace_id = v_workspace_id;
    end if;

    v_new_id := gen_random_uuid();
    perform public.create_task_node(
      v_new_id, p_container_id, coalesce(nullif(v_row->>'title', ''), 'Sin título'), v_status_id, v_position,
      coalesce(v_row->>'priority', 'medium'), v_assignee_id,
      nullif(v_row->>'due_date', '')::date, null, nullif(v_row->>'start_date', '')::date,
      coalesce((v_row->>'is_milestone')::boolean, false)
    );

    -- label_ids: cada uno se valida contra el workspace de destino antes
    -- de insertarse, mismo motivo que assignee_id arriba.
    if v_row ? 'label_ids' then
      for v_label_id in select (jsonb_array_elements_text(v_row->'label_ids'))::uuid loop
        if exists (select 1 from public.labels where id = v_label_id and workspace_id = v_workspace_id) then
          insert into public.task_labels (node_id, label_id) values (v_new_id, v_label_id) on conflict do nothing;
        end if;
      end loop;
    end if;

    return next v_new_id;
  end loop;
end;
$$;

revoke execute on function public.import_tasks(uuid, jsonb) from public, anon;
grant execute on function public.import_tasks(uuid, jsonb) to authenticated;
