-- 0095_platform_admin.sql — administrador de plataforma ("super admin").
--
-- Hasta ahora el registro estaba cerrado (0022) y cada invitación metía a la
-- persona en un workspace YA existente: no había forma de que alguien tuviera
-- su propio Flow, aislado del resto. Esta migración agrega un nivel por encima
-- de los workspaces:
--
--   * platform_admins   quién administra la plataforma (no es el rol `owner`
--                       de un workspace; es independiente de ellos).
--   * owner_invitations invitaciones para crear un workspace PROPIO.
--   * platform_owners   quién puede crear workspaces y cuántos (cuota).
--   * platform_settings tope global de workspaces de toda la instancia.
--
-- ============================================================
-- Privacidad: el super admin ve METADATOS, nunca contenido
-- ============================================================
-- Las funciones admin_* devuelven agregados (nombre del workspace, dueño,
-- cantidad de miembros/tareas, almacenamiento). Ninguna lee títulos de tareas,
-- comentarios ni adjuntos, y el RLS de los workspaces no se toca: el super
-- admin NO es miembro de los workspaces ajenos, así que no los puede leer por
-- la API. (Quien administra el proyecto de Supabase siempre puede mirar la base
-- directamente; eso no lo cambia ninguna migración.)

-- ============================================================
-- 1. Tablas
-- ============================================================
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  max_workspaces int not null default 1 check (max_workspaces >= 0),
  created_at timestamptz not null default now()
);

create table public.owner_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  max_workspaces int not null default 1 check (max_workspaces >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);
-- Una sola invitación pendiente por correo: reinvitar la reemplaza.
create unique index owner_invitations_pending_email
  on public.owner_invitations (lower(email)) where status = 'pending';

-- Fila única. `max_total_workspaces` protege los topes del plan gratuito
-- (500 MB de base en Supabase, 10 GB en R2), que comparten todos.
create table public.platform_settings (
  id boolean primary key default true check (id),
  max_total_workspaces int not null default 10 check (max_total_workspaces >= 0)
);
insert into public.platform_settings default values;

-- Sin policies: con RLS activo y sin ninguna, nadie accede por la API. Todo
-- pasa por las funciones security definer de abajo.
alter table public.platform_admins enable row level security;
alter table public.platform_owners enable row level security;
alter table public.owner_invitations enable row level security;
alter table public.platform_settings enable row level security;

-- ============================================================
-- 2. ¿Es super admin?
-- ============================================================
create or replace function public.is_platform_admin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

revoke execute on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.assert_platform_admin()
returns void
language plpgsql security definer stable set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.assert_platform_admin() from public;

-- ============================================================
-- 3. Quién es el primer super admin
-- ============================================================
-- Instancia existente: el fundador es la cuenta más antigua.
insert into public.platform_admins (user_id)
select id from auth.users order by created_at limit 1
on conflict do nothing;

-- Instancia nueva: la primera cuenta que se registra queda como super admin.
-- Es la misma condición de 0022 ("no hay ningún usuario todavía"), así que
-- ocurre exactamente una vez en la vida del proyecto. AFTER INSERT para que la
-- fila de auth.users ya exista (FK).
create or replace function public.bootstrap_platform_admin()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from auth.users) = 1 then
    insert into public.platform_admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_bootstrap_platform_admin
  after insert on auth.users
  for each row execute function public.bootstrap_platform_admin();

-- ============================================================
-- 4. Registro: también pasa quien tiene una invitación de owner
-- ============================================================
create or replace function public.enforce_signup_policy()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from auth.users) then
    return new;
  end if;

  if exists (
    select 1 from public.invitations
    where lower(email) = lower(new.email)
      and status = 'pending'
      and expires_at > now()
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.owner_invitations
    where lower(email) = lower(new.email)
      and status = 'pending'
      and expires_at > now()
  ) then
    return new;
  end if;

  raise exception 'El registro está cerrado. Necesitas una invitación para entrar.'
    using errcode = '42501';
end;
$$;

-- ============================================================
-- 5. Aceptar invitaciones de owner (se llama junto a accept_pending_invitations)
-- ============================================================
-- Misma identidad que 0018: correo VERIFICADO de auth.users. Sin esto,
-- cualquiera podría registrarse con el correo ajeno y quedarse la cuota.
create or replace function public.accept_owner_invitations()
returns void
language plpgsql security definer set search_path = public
as $$
declare v_email text; v_max int;
begin
  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return; end if;

  select max(max_workspaces) into v_max
  from public.owner_invitations
  where lower(email) = v_email and status = 'pending' and expires_at > now();
  if v_max is null then return; end if;

  insert into public.platform_owners (user_id, max_workspaces)
  values (auth.uid(), v_max)
  on conflict (user_id) do update
    set max_workspaces = greatest(public.platform_owners.max_workspaces, excluded.max_workspaces);

  update public.owner_invitations set status = 'accepted'
  where lower(email) = v_email and status = 'pending' and expires_at > now();
end;
$$;

revoke execute on function public.accept_owner_invitations() from public;
grant execute on function public.accept_owner_invitations() to authenticated;

-- ============================================================
-- 6. Cuota al crear un workspace
-- ============================================================
-- Antes cualquier usuario autenticado podía llamar esta RPC (solo la UI lo
-- impedía). Ahora la regla vive acá: o eres super admin, o eres owner invitado
-- y estás dentro de tu cuota, y además hay cupo global.
create or replace function public.create_workspace_with_defaults(p_name text)
returns table (workspace_id uuid, project_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_space_id uuid;
  v_project_id uuid;
  v_slug text;
  v_max int;
  v_mine int;
  v_total_cap int;
begin
  if auth.uid() is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if not public.is_platform_admin() then
    select max_workspaces into v_max from public.platform_owners where user_id = auth.uid();
    if v_max is null then
      raise exception 'No tienes permiso para crear un workspace.' using errcode = '42501';
    end if;
    select count(*) into v_mine from public.workspaces where created_by = auth.uid();
    if v_mine >= v_max then
      raise exception 'Alcanzaste el máximo de workspaces permitidos (%).', v_max using errcode = '42501';
    end if;
    select max_total_workspaces into v_total_cap from public.platform_settings;
    if (select count(*) from public.workspaces) >= v_total_cap then
      raise exception 'La plataforma alcanzó su límite de workspaces.' using errcode = '42501';
    end if;
  end if;

  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);

  insert into public.workspaces (name, slug, created_by)
  values (p_name, v_slug, auth.uid())
  returning id into v_workspace_id;

  insert into public.memberships (workspace_id, user_id, role)
  values (v_workspace_id, auth.uid(), 'owner');

  insert into public.nodes (workspace_id, parent_id, type, title, created_by)
  values (v_workspace_id, null, 'space', 'General', auth.uid())
  returning id into v_space_id;

  v_project_id := public.create_project_with_defaults(v_space_id, 'Proyecto de ejemplo');

  return query select v_workspace_id, v_project_id;
end;
$$;

-- ============================================================
-- 7. Funciones de administración (solo super admin, solo metadatos)
-- ============================================================
create or replace function public.admin_overview()
returns jsonb
language plpgsql security definer stable set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  return jsonb_build_object(
    'max_total_workspaces', (select max_total_workspaces from public.platform_settings),
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'created_at', w.created_at,
        'owner_email', (select p.email from public.profiles p where p.id = w.created_by),
        'members', (select count(*) from public.memberships m where m.workspace_id = w.id),
        'tasks', (select count(*) from public.nodes n where n.workspace_id = w.id and n.type = 'task'),
        'storage_bytes', (
          select coalesce(sum(a.size_bytes), 0)
          from public.task_attachments a join public.nodes n on n.id = a.node_id
          where n.workspace_id = w.id
        )
      ) order by w.created_at)
      from public.workspaces w
    ), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', o.user_id,
        'email', (select p.email from public.profiles p where p.id = o.user_id),
        'max_workspaces', o.max_workspaces,
        'workspaces', (select count(*) from public.workspaces w where w.created_by = o.user_id)
      ) order by o.created_at)
      from public.platform_owners o
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'max_workspaces', i.max_workspaces,
        'status', i.status, 'expires_at', i.expires_at
      ) order by i.created_at desc)
      from public.owner_invitations i where i.status = 'pending'
    ), '[]'::jsonb)
  );
end;
$$;

-- El Worker llama esto ANTES de mandar el correo (mismo patrón que
-- invite_member): la autorización la decide la base, no el Worker.
create or replace function public.admin_invite_owner(p_email text, p_max_workspaces int default 1)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  perform public.assert_platform_admin();
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo inválido';
  end if;
  if p_max_workspaces < 0 then raise exception 'Cuota inválida'; end if;

  update public.owner_invitations set status = 'revoked'
  where lower(email) = v_email and status = 'pending';

  insert into public.owner_invitations (email, max_workspaces, invited_by)
  values (v_email, p_max_workspaces, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_revoke_owner_invitation(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  update public.owner_invitations set status = 'revoked' where id = p_id and status = 'pending';
end;
$$;

create or replace function public.admin_set_owner_quota(p_user_id uuid, p_max_workspaces int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_max_workspaces < 0 then raise exception 'Cuota inválida'; end if;
  update public.platform_owners set max_workspaces = p_max_workspaces where user_id = p_user_id;
end;
$$;

create or replace function public.admin_set_total_limit(p_max int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_platform_admin();
  if p_max < 0 then raise exception 'Límite inválido'; end if;
  update public.platform_settings set max_total_workspaces = p_max;
end;
$$;

-- Borra un workspace completo (todo cuelga de workspaces con ON DELETE
-- CASCADE). Exige el nombre exacto como confirmación: es irreversible. Los
-- adjuntos en R2 NO se borran con esto (viven fuera de la base); quedan
-- huérfanos hasta que se limpie el bucket.
create or replace function public.admin_delete_workspace(p_workspace_id uuid, p_confirm_name text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  perform public.assert_platform_admin();
  select name into v_name from public.workspaces where id = p_workspace_id;
  if v_name is null then raise exception 'Workspace no encontrado'; end if;
  if v_name is distinct from p_confirm_name then
    raise exception 'El nombre de confirmación no coincide';
  end if;
  delete from public.workspaces where id = p_workspace_id;
end;
$$;

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'public.admin_overview()',
    'public.admin_invite_owner(text,int)',
    'public.admin_revoke_owner_invitation(uuid)',
    'public.admin_set_owner_quota(uuid,int)',
    'public.admin_set_total_limit(int)',
    'public.admin_delete_workspace(uuid,text)'
  ] loop
    execute format('revoke execute on function %s from public', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $$;
