-- 0002_onboarding.sql — RPCs de creación atómica (workspace y proyecto)
-- security definer por atomicidad (workspace+membership+space+project+statuses
-- en una transacción), no por bypass de RLS (la policy placeholder de 0001 ya
-- permite el insert directo). create_project_with_defaults se reutiliza tanto
-- en onboarding como en "crear proyecto nuevo" para no duplicar la regla de
-- negocio "todo proyecto nace con 3 statuses default".

create or replace function public.create_project_with_defaults(
  p_space_id uuid,
  p_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  insert into public.projects (space_id, name)
  values (p_space_id, p_name)
  returning id into v_project_id;

  insert into public.statuses (project_id, name, status_kind, position, is_default)
  values
    (v_project_id, 'Por hacer',   'neutral', 0, true),
    (v_project_id, 'En progreso', 'neutral', 1, false),
    (v_project_id, 'Hecho',       'success', 2, false);

  return v_project_id;
end;
$$;

grant execute on function public.create_project_with_defaults(uuid, text) to authenticated;

create or replace function public.create_workspace_with_defaults(
  p_name text
) returns table (workspace_id uuid, project_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_space_id uuid;
  v_project_id uuid;
  v_slug text;
begin
  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(md5(random()::text), 1, 6);

  insert into public.workspaces (name, slug, created_by)
  values (p_name, v_slug, auth.uid())
  returning id into v_workspace_id;

  insert into public.memberships (workspace_id, user_id, role)
  values (v_workspace_id, auth.uid(), 'owner');

  insert into public.spaces (workspace_id, name)
  values (v_workspace_id, 'General')
  returning id into v_space_id;

  v_project_id := public.create_project_with_defaults(v_space_id, 'Proyecto de ejemplo');

  return query select v_workspace_id, v_project_id;
end;
$$;

grant execute on function public.create_workspace_with_defaults(text) to authenticated;
