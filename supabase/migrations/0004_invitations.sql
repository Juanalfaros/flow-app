-- 0004_invitations.sql — RPCs de invitación por email. Ver plan F2 M2.
-- El envío del email en sí usa auth.admin.inviteUserByEmail (Worker, con
-- service_role) — estas RPCs solo gestionan el registro pendiente y la
-- aceptación (creación de membership), corriendo bajo RLS normal del
-- usuario que invita/acepta.

create or replace function public.invite_member(p_workspace_id uuid, p_email text, p_role text)
returns public.invitations
language plpgsql security definer set search_path = public
as $$
declare v_invitation public.invitations;
begin
  if not public.is_admin_of(p_workspace_id) then
    raise exception 'Solo admin/owner puede invitar miembros';
  end if;
  if p_role not in ('admin','member','guest') then
    raise exception 'Rol inválido: %', p_role;
  end if;

  insert into public.invitations (workspace_id, email, role, invited_by)
  values (p_workspace_id, lower(p_email), p_role, auth.uid())
  on conflict (workspace_id, email) do update
    set role = excluded.role, status = 'pending', invited_by = excluded.invited_by,
        created_at = now(), expires_at = now() + interval '7 days', token = gen_random_uuid()
  returning * into v_invitation;
  return v_invitation;
end;
$$;
grant execute on function public.invite_member(uuid, text, text) to authenticated;

-- Se llama en cada carga de /_app (beforeLoad), idempotente y barata.
create or replace function public.accept_pending_invitations()
returns void
language plpgsql security definer set search_path = public
as $$
declare v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then return; end if;

  insert into public.memberships (workspace_id, user_id, role)
  select i.workspace_id, auth.uid(), i.role
  from public.invitations i
  where i.email = v_email and i.status = 'pending' and i.expires_at > now()
  on conflict (workspace_id, user_id) do nothing;

  update public.invitations set status = 'accepted'
  where email = v_email and status = 'pending' and expires_at > now();
end;
$$;
grant execute on function public.accept_pending_invitations() to authenticated;

-- Preview público para /accept-invite, sin necesitar policy de SELECT
-- abierta sobre invitations.
create or replace function public.get_invitation_preview(p_token uuid)
returns table (workspace_name text, email text, role text, status text, expires_at timestamptz)
language sql security definer stable set search_path = public
as $$
  select w.name, i.email, i.role, i.status, i.expires_at
  from public.invitations i join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token;
$$;
grant execute on function public.get_invitation_preview(uuid) to anon, authenticated;
