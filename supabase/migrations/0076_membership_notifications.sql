-- 0076_membership_notifications.sql — los tres correos que la auditoría de
-- emails (2026-09-11, ver el artifact "Correos de Flow") marcó para
-- construir primero: "te sacaron del workspace", "te cambiaron el rol" y
-- "bienvenida" tras aceptar una invitación de verdad. Los tres reusan la
-- infraestructura de `notifications` que ya existe — mismo webhook
-- (0051_push_dispatch_webhook.sql) -> push-dispatch.ts -> email-dispatch.ts
-- que assigned/status_changed/etc. No hay tabla ni pipeline nuevo, solo un
-- `insert into notifications` agregado a tres RPCs que ya existían.

-- ============================================================
-- 1. Tres tipos nuevos en el CHECK de notifications.type.
-- ============================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'assigned', 'status_changed', 'comment', 'mention', 'watched_activity',
    'unblocked', 'due_reminder', 'removed_from_workspace', 'role_changed', 'welcome'
  ));

-- ============================================================
-- 2. remove_member (0075) — notifica ANTES de borrar la membresía.
-- ============================================================
-- `notifications.recipient_id` no exige que la persona siga siendo
-- miembro de `workspace_id` (a diferencia de `notifications_select_own` +
-- `is_member_of`, Fase 0 de 0067 — esa policy sigue bloqueando la LECTURA
-- en la campana in-app una vez fuera, que es lo esperado: el punto de este
-- correo es justamente avisar por fuera de la app). El envío lo hace el
-- Service Role del Worker sin pasar por RLS.
create or replace function public.remove_member(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_target_role text;
  v_caller_role text;
begin
  if p_user_id = auth.uid() then
    raise exception 'No podés eliminarte a vos mismo' using errcode = '22023';
  end if;

  select m.workspace_id, m.role into v_workspace_id, v_target_role
  from public.memberships m
  where m.user_id = p_user_id
    and exists (
      select 1 from public.memberships me
      where me.workspace_id = m.workspace_id and me.user_id = auth.uid()
    )
  limit 1;

  perform public.assert_admin_of(v_workspace_id);

  if v_target_role = 'owner' then
    raise exception 'No se puede eliminar al dueño del workspace' using errcode = '22023';
  end if;

  v_caller_role := public.member_role(v_workspace_id);

  if v_target_role = 'admin' and v_caller_role != 'owner' then
    raise exception 'Solo el dueño puede eliminar a un administrador' using errcode = '22023';
  end if;

  insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
  values (v_workspace_id, p_user_id, auth.uid(), null, 'removed_from_workspace', '{}'::jsonb);

  delete from public.memberships
  where workspace_id = v_workspace_id and user_id = p_user_id;
end;
$$;

-- ============================================================
-- 3. update_member_role (0071) — notifica el cambio real de rol.
-- ============================================================
create or replace function public.update_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_current_role text;
begin
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

  if p_user_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol' using errcode = '22023';
  end if;

  update public.memberships set role = p_role
  where workspace_id = v_workspace_id and user_id = p_user_id;

  -- Solo si de verdad cambió algo — evita un correo sin sentido si algún
  -- día el cliente manda el mismo rol que ya tenía.
  if p_role is distinct from v_current_role then
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (
      v_workspace_id, p_user_id, auth.uid(), null, 'role_changed',
      jsonb_build_object('old_role', v_current_role, 'new_role', p_role)
    );
  end if;
end;
$$;

-- ============================================================
-- 4. accept_pending_invitations (0004) — bienvenida al aceptar de verdad.
-- ============================================================
-- Se llama en cada carga de /_app (beforeLoad), así que no alcanza con
-- "insertar y notificar siempre" — mandaría "bienvenida" en cada carga de
-- página. El CTE captura cuáles filas de `memberships` se insertaron DE
-- VERDAD (`on conflict do nothing` puede insertar cero) y solo esas
-- disparan la notificación.
create or replace function public.accept_pending_invitations()
returns void
language plpgsql security definer set search_path = public
as $$
declare v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then return; end if;

  with newly_joined as (
    insert into public.memberships (workspace_id, user_id, role)
    select i.workspace_id, auth.uid(), i.role
    from public.invitations i
    where i.email = v_email and i.status = 'pending' and i.expires_at > now()
    on conflict (workspace_id, user_id) do nothing
    returning workspace_id
  )
  insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
  select workspace_id, auth.uid(), null, null, 'welcome', '{}'::jsonb
  from newly_joined;

  update public.invitations set status = 'accepted'
  where email = v_email and status = 'pending' and expires_at > now();
end;
$$;
