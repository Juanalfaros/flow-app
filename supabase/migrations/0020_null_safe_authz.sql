-- 0020_null_safe_authz.sql — cierra un bypass de autorización encontrado
-- verificando 0017 contra la base real, no leyendo el código.
--
-- ============================================================
-- El bug: lógica de tres valores
-- ============================================================
-- `member_role(w)` es `select role from memberships where ... and user_id = auth.uid()`.
-- Sin fila (no miembro, o directamente sin sesión) devuelve NULL, no 'none'.
-- Entonces `is_admin_of(w)` es `select NULL in ('owner','admin')` -> NULL.
--
-- Y en plpgsql, `if not NULL then ... end if` NO entra al then: `not NULL` es
-- NULL, y un IF solo dispara con TRUE. Así que este guard de `invite_member`
-- (0004_invitations.sql) no detenía a nadie:
--
--     if not public.is_admin_of(p_workspace_id) then
--       raise exception 'Solo admin/owner puede invitar miembros';
--     end if;
--
-- Verificado contra el proyecto remoto: una llamada ANÓNIMA (solo con la
-- anon key, que viaja pública en el bundle de JS) atraviesa el guard y llega
-- al INSERT — solo falló por violar el FK de workspace_id porque la prueba
-- usó un uuid inexistente. Con un workspace_id real el insert habría entrado.
--
-- Impacto: cualquiera podía crear una invitación `role='admin'` para su
-- propio email en un workspace ajeno y después aceptarla vía
-- accept_pending_invitations. Escalada completa a admin, sin autenticarse.
--
-- (`assert_member_of`/`assert_admin_of` de 0017 ya eran null-safe por su
-- guard explícito de `p_workspace_id is null` + `not is_member_of(...)` sobre
-- `is_member_of`, que usa `exists()` y nunca devuelve NULL. El agujero estaba
-- solo en el camino de `is_admin_of`.)

-- ============================================================
-- 1. is_admin_of devuelve boolean, nunca NULL
-- ============================================================
-- La defensa de fondo: que la función no pueda devolver NULL desarma este
-- tipo de bug para todo llamador presente y futuro, no solo para los dos que
-- se arreglan abajo.
create or replace function public.is_admin_of(p_workspace_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(public.member_role(p_workspace_id) in ('owner', 'admin'), false);
$$;

-- ============================================================
-- 2. invite_member: usar el assert null-safe
-- ============================================================
create or replace function public.invite_member(p_workspace_id uuid, p_email text, p_role text)
returns public.invitations
language plpgsql security definer set search_path = public
as $$
declare v_invitation public.invitations;
begin
  -- assert_admin_of (0017) rechaza tanto p_workspace_id null como el caso
  -- "no es admin", y lanza 42501 -> PostgREST responde 403 en vez de 500.
  perform public.assert_admin_of(p_workspace_id);

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

-- ============================================================
-- 3. create_workspace_with_defaults: exigir sesión
-- ============================================================
-- Llamada sin sesión llegaba hasta el insert de `memberships` y ahí moría por
-- NOT NULL en user_id (23502). No era explotable —toda la función es una
-- transacción y revierte— pero devolvía un error de constraint en vez de un
-- 403, y dejaba que un anónimo ejercitara la ruta de escritura.
create or replace function public.create_workspace_with_defaults(p_name text)
returns table (workspace_id uuid, project_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_space_id uuid;
  v_project_id uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'No autorizado' using errcode = '42501';
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
-- 4. Quitar el EXECUTE implícito a PUBLIC (defensa en profundidad)
-- ============================================================
-- Postgres concede EXECUTE a PUBLIC por defecto en toda función nueva, así
-- que los `grant execute ... to authenticated` de las migraciones anteriores
-- eran redundantes: el rol `anon` ya podía llamar TODAS estas RPCs. Eso es lo
-- que convirtió el bug de arriba en algo alcanzable sin siquiera tener cuenta.
--
-- Ninguna de estas funciones necesita ejecutarse sin sesión: la única que sí
-- era pública a propósito (`get_invitation_preview`) se eliminó en 0018.
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.is_member_of(uuid)',
    'public.is_admin_of(uuid)',
    'public.member_role(uuid)',
    'public.assert_member_of(uuid)',
    'public.assert_admin_of(uuid)',
    'public.try_uuid(text)',
    'public.would_create_cycle(uuid, uuid)',
    'public.invite_member(uuid, text, text)',
    'public.accept_pending_invitations()',
    'public.create_workspace_with_defaults(text)',
    'public.create_project_with_defaults(uuid, text)',
    'public.create_task_node(uuid, uuid, text, uuid, numeric, text, uuid, date, uuid, date, boolean)',
    'public.move_task_node(uuid, uuid, uuid, numeric)',
    'public.move_project_tasks(uuid, uuid, uuid)',
    'public.delete_project_with_tasks(uuid)',
    'public.delete_folder_with_contents(uuid)',
    'public.rebalance_positions(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public', v_sig);
    execute format('revoke execute on function %s from anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $$;
