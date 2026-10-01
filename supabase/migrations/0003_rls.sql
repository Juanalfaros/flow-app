-- 0003_rls.sql — RLS real por membership, reemplaza los placeholders
-- permisivos de F0 (`f0_authenticated_all`). Ver plan F2 M1.

-- ============================================================
-- Funciones reutilizables (security definer: evitan recursión al
-- consultar memberships bajo su propia policy; set search_path = public
-- mitiga search_path hijacking, obligatorio en funciones security definer)
-- ============================================================

create or replace function public.is_member_of(p_workspace_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.member_role(p_workspace_id uuid)
returns text
language sql security definer stable set search_path = public
as $$
  select role from public.memberships
  where workspace_id = p_workspace_id and user_id = auth.uid();
$$;

create or replace function public.is_admin_of(p_workspace_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select public.member_role(p_workspace_id) in ('owner', 'admin');
$$;

grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.is_admin_of(uuid) to authenticated;
grant execute on function public.member_role(uuid) to authenticated;

-- ============================================================
-- workspaces
-- ============================================================
drop policy "f0_authenticated_all" on public.workspaces;
create policy "workspaces_select" on public.workspaces
  for select to authenticated using (public.is_member_of(id));
create policy "workspaces_update_admin" on public.workspaces
  for update to authenticated using (public.is_admin_of(id));

-- ============================================================
-- spaces
-- ============================================================
drop policy "f0_authenticated_all" on public.spaces;
create policy "spaces_select" on public.spaces
  for select to authenticated using (public.is_member_of(workspace_id));
create policy "spaces_write_admin" on public.spaces
  for all to authenticated
  using (public.is_admin_of(workspace_id)) with check (public.is_admin_of(workspace_id));

-- ============================================================
-- projects (join space_id -> workspace_id)
-- ============================================================
drop policy "f0_authenticated_all" on public.projects;
create policy "projects_select" on public.projects
  for select to authenticated using (
    exists (select 1 from public.spaces s
            where s.id = projects.space_id and public.is_member_of(s.workspace_id)));
create policy "projects_insert_member" on public.projects
  for insert to authenticated with check (
    exists (select 1 from public.spaces s
            where s.id = projects.space_id and public.is_member_of(s.workspace_id)));
create policy "projects_update_member" on public.projects
  for update to authenticated using (
    exists (select 1 from public.spaces s
            where s.id = projects.space_id and public.is_member_of(s.workspace_id)));
create policy "projects_delete_admin" on public.projects
  for delete to authenticated using (
    exists (select 1 from public.spaces s
            where s.id = projects.space_id and public.is_admin_of(s.workspace_id)));

-- ============================================================
-- statuses (join project_id -> space_id -> workspace_id)
-- cualquier member edita: StatusSettingsDialog ya funciona así en F1
-- sin distinción de rol, no cambiar esa UX sin que se pida.
-- ============================================================
drop policy "f0_authenticated_all" on public.statuses;
create policy "statuses_all_member" on public.statuses
  for all to authenticated using (
    exists (select 1 from public.projects p join public.spaces s on s.id = p.space_id
            where p.id = statuses.project_id and public.is_member_of(s.workspace_id))
  ) with check (
    exists (select 1 from public.projects p join public.spaces s on s.id = p.space_id
            where p.id = statuses.project_id and public.is_member_of(s.workspace_id)));

-- ============================================================
-- memberships
-- sin insert policy: solo vía create_workspace_with_defaults /
-- accept_pending_invitations (ambas security definer) — cierra "un
-- extraño se auto-inserta admin".
-- ============================================================
drop policy "f0_authenticated_all" on public.memberships;
create policy "memberships_select" on public.memberships
  for select to authenticated using (public.is_member_of(workspace_id));
create policy "memberships_update_admin" on public.memberships
  for update to authenticated
  using (public.is_admin_of(workspace_id)) with check (public.is_admin_of(workspace_id));
create policy "memberships_delete_admin" on public.memberships
  for delete to authenticated using (public.is_admin_of(workspace_id));

-- ============================================================
-- tasks (workspace_id ya denormalizado directo por trigger)
-- ============================================================
drop policy "f0_authenticated_all" on public.tasks;
create policy "tasks_all_member" on public.tasks
  for all to authenticated
  using (public.is_member_of(workspace_id)) with check (public.is_member_of(workspace_id));

-- ============================================================
-- comments (join task_id -> tasks.workspace_id)
-- ============================================================
drop policy "f0_authenticated_all" on public.comments;
create policy "comments_select" on public.comments
  for select to authenticated using (
    exists (select 1 from public.tasks t
            where t.id = comments.task_id and public.is_member_of(t.workspace_id)));
create policy "comments_insert_self" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid() and
    exists (select 1 from public.tasks t
            where t.id = comments.task_id and public.is_member_of(t.workspace_id)));
create policy "comments_delete_own_or_admin" on public.comments
  for delete to authenticated using (
    author_id = auth.uid() or
    exists (select 1 from public.tasks t
            where t.id = comments.task_id and public.is_admin_of(t.workspace_id)));

-- ============================================================
-- labels / task_labels
-- ============================================================
drop policy "f0_authenticated_all" on public.labels;
create policy "labels_all_member" on public.labels
  for all to authenticated
  using (public.is_member_of(workspace_id)) with check (public.is_member_of(workspace_id));

drop policy "f0_authenticated_all" on public.task_labels;
create policy "task_labels_all_member" on public.task_labels
  for all to authenticated using (
    exists (select 1 from public.tasks t
            where t.id = task_labels.task_id and public.is_member_of(t.workspace_id))
  ) with check (
    exists (
      select 1 from public.tasks t join public.labels l on l.workspace_id = t.workspace_id
      where t.id = task_labels.task_id and l.id = task_labels.label_id
        and public.is_member_of(t.workspace_id)));

-- ============================================================
-- invitations (solo admin/owner; el invitado no hace SELECT directo,
-- usa get_invitation_preview en 0004)
-- ============================================================
drop policy "f0_authenticated_all" on public.invitations;
create policy "invitations_all_admin" on public.invitations
  for all to authenticated
  using (public.is_admin_of(workspace_id)) with check (public.is_admin_of(workspace_id));

-- ============================================================
-- activity_log: reemplaza el select abierto (using true) de 0001
-- ============================================================
drop policy "activity_log_select" on public.activity_log;
create policy "activity_log_select_member" on public.activity_log
  for select to authenticated using (public.is_member_of(workspace_id));

-- ============================================================
-- profiles: agrega visibilidad de compañeros de workspace. Aditiva a
-- profiles_select_own (Postgres OR-ea las policies SELECT de una tabla).
-- Sin esto, cualquier embed de PostgREST hacia el perfil de OTRO usuario
-- (assignee de tarea, autor de comentario, miembro del workspace)
-- devuelve null silenciosamente en vez de la fila.
-- ============================================================
create policy "profiles_select_workspace_peers" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.memberships m1
      join public.memberships m2 on m1.workspace_id = m2.workspace_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id));
