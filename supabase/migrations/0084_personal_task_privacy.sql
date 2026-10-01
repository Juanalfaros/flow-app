-- 0084_personal_task_privacy.sql — Fase A de "privacidad de tareas y
-- espacios": las tareas personales (sin proyecto ni padre, `space_id`
-- null por diseño — ver 0028/0029) tenían un hueco real de RLS.
--
-- Todas las policies que necesitan resolver acceso sobre un nodo
-- "suelto" (sin espacio) usan el mismo atajo desde 0029:
--
--   n.space_id is null and public.is_member_of(n.workspace_id)
--
-- `is_member_of` no mira dueño ni asignado — CUALQUIER miembro del
-- workspace pasa esa condición, sea o no su propia tarea personal. En
-- la práctica nadie se topaba con la tarea personal de otro porque
-- ninguna vista de la app pide "todas las personales del workspace"
-- (personalTasksQueryOptions/myTasksQueryOptions siempre filtran por
-- created_by/assignee_id), pero la base misma nunca lo impedía — quien
-- conociera el uuid (o escribiera su propia consulta) podía leer título,
-- comentarios, adjuntos, tiempo cargado, etc. de la tarea personal de
-- cualquiera. Encontrado auditando el modelo de privacidad a pedido del
-- usuario, no reportado por nadie más.
--
-- El fix: un solo helper nuevo, reusado en las 9 tablas que repetían el
-- mismo atajo (confirmado por grep en todas las migraciones — no hay
-- ninguna más). Mismo criterio que el resto de las funciones de acceso
-- de este archivo (`is_admin_of` gana siempre, `coalesce(..., false)`
-- para que un NULL no abra nada).
create or replace function public.can_access_personal_node(
  p_created_by uuid, p_assignee_id uuid, p_workspace_id uuid
) returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    public.is_admin_of(p_workspace_id)
    or p_created_by = auth.uid()
    or p_assignee_id = auth.uid(),
    false
  );
$$;

revoke execute on function public.can_access_personal_node(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_access_personal_node(uuid, uuid, uuid) to authenticated;

-- ============================================================
-- 1. nodes — la policy raíz
-- ============================================================
drop policy "nodes_access" on public.nodes;
create policy "nodes_access" on public.nodes
  for all to authenticated
  using (
    case when space_id is null then public.can_access_personal_node(created_by, assignee_id, workspace_id)
         else public.can_access_node(id) end
  )
  with check (
    case when space_id is null then public.can_access_personal_node(created_by, assignee_id, workspace_id)
         else public.can_access_node_row(workspace_id, acl_boundary_id, space_id) end
  );

-- ============================================================
-- 2. comments + comment_mentions
-- ============================================================
drop policy "comments_select" on public.comments;
create policy "comments_select" on public.comments
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = comments.node_id
              and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                   or public.can_access_node(n.id))));

drop policy "comments_insert_self" on public.comments;
create policy "comments_insert_self" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.nodes n
                where n.id = comments.node_id
                  and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                       or public.can_access_node(n.id))));

drop policy "comment_mentions_select_member" on public.comment_mentions;
create policy "comment_mentions_select_member" on public.comment_mentions
  for select to authenticated using (
    exists (select 1 from public.comments c join public.nodes n on n.id = c.node_id
            where c.id = comment_mentions.comment_id
              and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                   or public.can_access_node(n.id))));

-- ============================================================
-- 3. task_labels
-- ============================================================
drop policy "task_labels_access" on public.task_labels;
create policy "task_labels_access" on public.task_labels
  for all to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = task_labels.node_id
              and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                   or public.can_access_node(n.id)))
  ) with check (
    exists (
      select 1 from public.nodes n join public.labels l on l.workspace_id = n.workspace_id
      where n.id = task_labels.node_id and l.id = task_labels.label_id
        and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
             or public.can_access_node(n.id))));

-- ============================================================
-- 4. activity_log
-- ============================================================
drop policy "activity_log_select_access" on public.activity_log;
create policy "activity_log_select_access" on public.activity_log
  for select to authenticated using (
    case
      when node_id is null then public.is_member_of(workspace_id)
      else exists (select 1 from public.nodes n
                   where n.id = activity_log.node_id
                     and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                          or public.can_access_node(n.id)))
    end
  );

-- ============================================================
-- 5. task_attachments
-- ============================================================
drop policy "task_attachments_select" on public.task_attachments;
create policy "task_attachments_select" on public.task_attachments
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = task_attachments.node_id
              and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                   or public.can_access_node(n.id))));

drop policy "task_attachments_insert_self" on public.task_attachments;
create policy "task_attachments_insert_self" on public.task_attachments
  for insert to authenticated with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.nodes n
                where n.id = task_attachments.node_id
                  and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                       or public.can_access_node(n.id))));

-- ============================================================
-- 6. task_assignees
-- ============================================================
drop policy "task_assignees_access" on public.task_assignees;
create policy "task_assignees_access" on public.task_assignees
  for all to authenticated using (
    exists (
      select 1 from public.nodes n
      where n.id = task_assignees.node_id
        and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
             or public.can_access_node(n.id))
    )
  ) with check (
    exists (
      select 1 from public.nodes n
      join public.memberships m on m.workspace_id = n.workspace_id
      where n.id = task_assignees.node_id
        and m.user_id = task_assignees.user_id
        and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
             or public.can_access_node(n.id))
    )
  );

-- ============================================================
-- 7. task_watchers
-- ============================================================
drop policy "task_watchers_access" on public.task_watchers;
create policy "task_watchers_access" on public.task_watchers
  for all to authenticated using (
    exists (
      select 1 from public.nodes n
      where n.id = task_watchers.node_id
        and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
             or public.can_access_node(n.id))
    )
  ) with check (
    exists (
      select 1 from public.nodes n
      join public.memberships m on m.workspace_id = n.workspace_id
      where n.id = task_watchers.node_id
        and m.user_id = task_watchers.user_id
        and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
             or public.can_access_node(n.id))
    )
  );

-- ============================================================
-- 8. task_reviewers
-- ============================================================
drop policy "task_reviewers_access" on public.task_reviewers;
create policy "task_reviewers_access" on public.task_reviewers
  for all to authenticated using (
    exists (
      select 1 from public.nodes n
      where n.id = task_reviewers.node_id
        and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
             or public.can_access_node(n.id))
    )
  ) with check (
    exists (
      select 1 from public.nodes n
      join public.memberships m on m.workspace_id = n.workspace_id
      where n.id = task_reviewers.node_id
        and m.user_id = task_reviewers.user_id
        and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
             or public.can_access_node(n.id))
    )
  );

-- ============================================================
-- 9. task_custom_field_values
-- ============================================================
drop policy "task_custom_field_values_access" on public.task_custom_field_values;
create policy "task_custom_field_values_access" on public.task_custom_field_values
  for all to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = task_custom_field_values.node_id
              and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                   or public.can_access_node(n.id)))
  ) with check (
    exists (
      select 1 from public.nodes n
      where n.id = task_custom_field_values.node_id
        and public.validate_custom_field_value(task_custom_field_values.field_id, task_custom_field_values.value)
        and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
             or public.can_access_node(n.id)))
  );

-- ============================================================
-- 10. time_entries
-- ============================================================
drop policy "time_entries_select" on public.time_entries;
create policy "time_entries_select" on public.time_entries
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = time_entries.node_id
              and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                   or public.can_access_node(n.id))));

drop policy "time_entries_insert_self" on public.time_entries;
create policy "time_entries_insert_self" on public.time_entries
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.nodes n
                where n.id = time_entries.node_id
                  and (n.space_id is null and public.can_access_personal_node(n.created_by, n.assignee_id, n.workspace_id)
                       or public.can_access_node(n.id))));
