-- 0071_admin_manage_members.sql — un admin/owner pasa a poder editar
-- nombre, foto y cargo de CUALQUIER miembro del workspace, y cambiar el
-- rol de cualquier miembro que no sea el dueño. Hasta acá ninguna de las
-- dos cosas existía: `profiles_update_own` (0001) es estrictamente
-- `auth.uid() = id` sin excepción para admin/owner (la única salvedad ya
-- existente es `manager_id`, vía `set_manager`, 0024), y `memberships.role`
-- solo se elegía al invitar — no había forma de cambiarlo después.
--
-- Mismo molde que `set_manager` (0024_profile_org_fields.sql) para las
-- dos funciones nuevas: resolver el workspace que comparten quien edita y
-- la persona editada, `assert_admin_of` sobre ese workspace, y recién ahí
-- escribir.

-- ============================================================
-- 1. update_member_role — cambia memberships.role de otro miembro.
-- ============================================================
create or replace function public.update_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_current_role text;
begin
  -- Mismos 4 roles que ya acepta invite_member (0031) — 'owner' nunca se
  -- asigna acá, solo lo pone create_workspace_with_defaults al crear el
  -- workspace.
  if p_role not in ('admin', 'member', 'restricted', 'guest') then
    raise exception 'Rol inválido: %', p_role using errcode = '22023';
  end if;

  select m.workspace_id, m.role into v_workspace_id, v_current_role
  from public.memberships m
  where m.user_id = p_user_id
    and exists (
      select 1 from public.memberships me
      where me.workspace_id = m.workspace_id and me.user_id = auth.uid()
    )
  limit 1;

  perform public.assert_admin_of(v_workspace_id);

  if v_current_role = 'owner' then
    raise exception 'No se puede cambiar el rol del dueño del workspace' using errcode = '22023';
  end if;

  -- Evita que un admin se saque el rol de admin por error y se quede
  -- sin poder deshacerlo (nadie más con acceso a este panel en ese
  -- instante) — mismo criterio preventivo que "no podés sacarte a vos
  -- mismo de revisor" en otras partes de la app.
  if p_user_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol' using errcode = '22023';
  end if;

  update public.memberships set role = p_role
  where workspace_id = v_workspace_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.update_member_role(uuid, text) from public, anon;
grant execute on function public.update_member_role(uuid, text) to authenticated;

-- ============================================================
-- 2. admin_update_profile — nombre/foto/cargo de otro miembro.
-- ============================================================
-- Reemplazo total de las 3 columnas (no un merge parcial): el cliente
-- siempre manda el snapshot completo desde el formulario de edición, así
-- que no hace falta un jsonb ni distinguir "no tocar" de "vaciar" — mismo
-- criterio de simplicidad que ya usa el resto de las RPCs de este repo
-- con pocos campos.
create or replace function public.admin_update_profile(
  p_user_id uuid, p_full_name text, p_avatar_url text, p_job_title text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select m.workspace_id into v_workspace_id
  from public.memberships m
  where m.user_id = p_user_id
    and exists (
      select 1 from public.memberships me
      where me.workspace_id = m.workspace_id and me.user_id = auth.uid()
    )
  limit 1;

  perform public.assert_admin_of(v_workspace_id);

  -- security definer: bypasea profiles_update_own (auth.uid() = id) a
  -- propósito, es justamente lo que esta función existe para permitir.
  -- El trigger protect_profile_email (0024) sigue intacto — no toca
  -- email/manager_id/last_seen_at, así que nada de esto lo esquiva.
  update public.profiles
  set full_name = p_full_name, avatar_url = p_avatar_url, job_title = p_job_title
  where id = p_user_id;
end;
$$;

revoke execute on function public.admin_update_profile(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_profile(uuid, text, text, text) to authenticated;

-- ============================================================
-- 3. Storage — un admin/owner también puede subir/reemplazar la FOTO de
--    otro miembro, no solo el texto de avatar_url.
-- ============================================================
-- `avatars_own_insert`/`avatars_own_update` (0010_avatars_storage.sql)
-- exigen que la primera carpeta del path sea el propio auth.uid() — eso
-- seguía bloqueando a un admin aunque `admin_update_profile` ya le
-- permitiera escribir la columna. Políticas ADITIVAS (permisivas, se
-- OR-ean con las existentes): no tocan el camino de "cada quien la
-- suya", solo suman el de "admin del workspace de esa persona".
create policy "avatars_admin_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and exists (
      select 1 from public.memberships target
      where target.user_id::text = (storage.foldername(name))[1]
        and public.is_admin_of(target.workspace_id)
    )
  );

create policy "avatars_admin_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from public.memberships target
      where target.user_id::text = (storage.foldername(name))[1]
        and public.is_admin_of(target.workspace_id)
    )
  );
