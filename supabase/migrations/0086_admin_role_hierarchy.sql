-- 0086_admin_role_hierarchy.sql — auditoría del modelo de roles/invitados
-- (a pedido del usuario): `remove_member` (0075) estableció una
-- jerarquía de 3 niveles — "el dueño elimina a cualquiera; un
-- administrador elimina a cualquiera MENOS a otro administrador MENOS
-- al dueño" — pero `update_member_role` (0071, migración ANTERIOR a
-- 0075) nunca se actualizó para exigir la misma jerarquía sobre el
-- CAMBIO de rol.
--
-- Hueco real, no teórico: confirmado a mano contra producción (creando
-- un segundo admin de prueba, revertido después) que un administrador
-- que no es dueño puede degradar a OTRO administrador a 'member' vía
-- `update_member_role` — logra el mismo resultado práctico que
-- `remove_member` bloquea a propósito ("solo el dueño puede eliminar a
-- un administrador"), solo que por la puerta de al lado. Alcanzable
-- desde la UI real: `PersonPanel.tsx` calcula
-- `canChangeRole={person.role !== 'owner' && !isSelf}` sin excluir
-- `person.role === 'admin'`, así que el control ya estaba expuesto, no
-- solo llamable a mano desde la consola.
create or replace function public.update_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_current_role text;
  v_caller_role text;
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

  -- Mismo criterio que remove_member (0075): solo el dueño puede tocar
  -- a otro administrador.
  v_caller_role := public.member_role(v_workspace_id);
  if v_current_role = 'admin' and v_caller_role != 'owner' then
    raise exception 'Solo el dueño puede cambiar el rol de un administrador' using errcode = '22023';
  end if;

  update public.memberships set role = p_role
  where workspace_id = v_workspace_id and user_id = p_user_id;
end;
$$;
