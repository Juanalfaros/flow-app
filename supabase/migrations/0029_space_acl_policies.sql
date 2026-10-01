-- 0029_space_acl_policies.sql — la RLS pasa a consultar el acceso por espacio.
--
-- Esta es la migración con más riesgo del proyecto: toca las policies de las
-- tablas de las que dependen board, list, gantt, calendario, mis tareas y la
-- búsqueda. Un error acá no se ve como un error, se ve como trabajo que
-- desapareció.
--
-- Lo que la hace segura de desplegar: TODOS los espacios quedan
-- `is_private = false` (default de 0028), y para un espacio público
-- `can_access_space` devuelve exactamente `is_member_of(workspace_id)` — la
-- misma condición que había antes. O sea que el comportamiento observable no
-- cambia hasta que alguien marque un espacio como privado.

-- ============================================================
-- 0. Guardia: sin backfill completo, esta migración no se aplica
-- ============================================================
-- Si algún nodo con contenedor quedó sin `space_id`, las policies de abajo lo
-- volverían invisible para todo el mundo. Antes que aplicar eso y salir a
-- buscar qué se perdió, la migración aborta y deja la base como estaba.
--
-- Se excluyen las tareas personales: no tienen proyecto ni padre (ver
-- `createPersonalTask`), así que su `space_id` es null legítimamente y las
-- policies las contemplan aparte.
do $$
declare
  v_orphans int;
begin
  select count(*) into v_orphans
  from public.nodes n
  where n.space_id is null
    and (n.parent_id is not null
         or exists (select 1 from public.node_memberships nm where nm.node_id = n.id)
         or n.type <> 'task');

  if v_orphans > 0 then
    raise exception
      'Backfill incompleto: % nodo(s) con contenedor sin space_id. Revisar 0028 antes de aplicar las policies.',
      v_orphans;
  end if;
end $$;

-- ============================================================
-- 1. nodes
-- ============================================================
-- El `case` sobre `space_id is null` cubre las tareas personales: nacen sin
-- espacio (sin proyecto ni padre) y sin esta rama quedarían inaccesibles para
-- su propio dueño. No abre ningún hueco: el trigger de 0028 asigna `space_id`
-- en cuanto un nodo tiene padre o contenedor, así que un nodo dentro de un
-- espacio privado nunca llega acá con null.
drop policy "nodes_all_member" on public.nodes;
create policy "nodes_access" on public.nodes
  for all to authenticated
  using (
    case when space_id is null then public.is_member_of(workspace_id)
         else public.can_access_space(space_id) end
  )
  with check (
    case when space_id is null then public.is_member_of(workspace_id)
         else public.can_access_space(space_id) end
  );

-- ============================================================
-- 2. node_memberships
-- ============================================================
drop policy "node_memberships_all_member" on public.node_memberships;
create policy "node_memberships_access" on public.node_memberships
  for all to authenticated
  using (
    exists (select 1 from public.nodes n
            where n.id = node_memberships.container_id and public.can_access_space(n.space_id))
  ) with check (
    exists (select 1 from public.nodes n
            where n.id = node_memberships.container_id and public.can_access_space(n.space_id))
    and exists (select 1 from public.nodes n2
                where n2.id = node_memberships.node_id
                  and (n2.space_id is null or public.can_access_space(n2.space_id)))
  );

-- ============================================================
-- 3. statuses
-- ============================================================
drop policy "statuses_all_member" on public.statuses;
create policy "statuses_access" on public.statuses
  for all to authenticated
  using (
    exists (select 1 from public.nodes n
            where n.id = statuses.project_id and public.can_access_space(n.space_id))
  ) with check (
    exists (select 1 from public.nodes n
            where n.id = statuses.project_id and public.can_access_space(n.space_id)));

-- ============================================================
-- 4. comments + comment_mentions
-- ============================================================
drop policy "comments_select" on public.comments;
drop policy "comments_insert_self" on public.comments;
drop policy "comments_delete_own_or_admin" on public.comments;

create policy "comments_select" on public.comments
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = comments.node_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_space(n.space_id))));

create policy "comments_insert_self" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.nodes n
                where n.id = comments.node_id
                  and (n.space_id is null and public.is_member_of(n.workspace_id)
                       or public.can_access_space(n.space_id))));

create policy "comments_delete_own_or_admin" on public.comments
  for delete to authenticated using (
    author_id = auth.uid()
    or exists (select 1 from public.nodes n
               where n.id = comments.node_id and public.is_admin_of(n.workspace_id)));

drop policy "comment_mentions_select_member" on public.comment_mentions;
create policy "comment_mentions_select_member" on public.comment_mentions
  for select to authenticated using (
    exists (select 1 from public.comments c join public.nodes n on n.id = c.node_id
            where c.id = comment_mentions.comment_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_space(n.space_id))));

-- ============================================================
-- 5. task_labels y task_dependencies
-- ============================================================
drop policy "task_labels_all_member" on public.task_labels;
create policy "task_labels_access" on public.task_labels
  for all to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = task_labels.node_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_space(n.space_id)))
  ) with check (
    exists (
      select 1 from public.nodes n join public.labels l on l.workspace_id = n.workspace_id
      where n.id = task_labels.node_id and l.id = task_labels.label_id
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_space(n.space_id))));

drop policy "task_dependencies_all_member" on public.task_dependencies;
create policy "task_dependencies_access" on public.task_dependencies
  for all to authenticated
  using (
    exists (select 1 from public.nodes n where n.id = predecessor_id and public.can_access_space(n.space_id))
    and exists (select 1 from public.nodes n where n.id = successor_id and public.can_access_space(n.space_id))
  )
  with check (
    predecessor_id <> successor_id
    and exists (select 1 from public.nodes n where n.id = predecessor_id and public.can_access_space(n.space_id))
    and exists (select 1 from public.nodes n where n.id = successor_id and public.can_access_space(n.space_id))
    and not public.would_create_cycle(predecessor_id, successor_id)
  );

-- ============================================================
-- 6. activity_log
-- ============================================================
-- `node_id` es nullable, y hay entradas de workspace sin nodo asociado: esas
-- siguen rigiéndose por membresía. Las que sí tienen nodo pasan por el espacio,
-- para que la actividad de un espacio privado no se filtre por el feed —
-- exactamente el tipo de fuga que es fácil pasar por alto.
drop policy "activity_log_select_member" on public.activity_log;
create policy "activity_log_select_access" on public.activity_log
  for select to authenticated using (
    case
      when node_id is null then public.is_member_of(workspace_id)
      else exists (select 1 from public.nodes n
                   where n.id = activity_log.node_id
                     and (n.space_id is null and public.is_member_of(n.workspace_id)
                          or public.can_access_space(n.space_id)))
    end
  );

-- ============================================================
-- 7. favorites y recent_views
-- ============================================================
-- Son personales, pero embeben el nodo: si alguien pierde acceso a un espacio,
-- sus favoritos de ahí no deben seguir mostrando título ni estado. El embed
-- pasa por la policy de `nodes`, que ya filtra — no hace falta tocar estas dos.
-- Se deja constancia para que no parezca un olvido.
