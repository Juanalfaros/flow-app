-- 0075_remove_member.sql — admin/owner pueden eliminar a un miembro del
-- workspace. Jerarquía de 3 niveles pedida por el usuario: dueño elimina a
-- cualquiera (admin/miembro/restringido/invitado); administrador elimina a
-- cualquiera MENOS a otro administrador y MENOS al dueño. Nadie se elimina
-- a sí mismo por acá (mismo criterio preventivo que ya usa
-- update_member_role, 0071 — "no podés cambiar tu propio rol").
--
-- Dos capas, no una: la RPC de abajo es la única puerta que el cliente usa
-- (da mensajes de error claros en español, mismo criterio que
-- update_member_role), PERO `memberships_delete_admin` (0003_rls.sql) ya
-- permitía un DELETE directo a cualquier admin/owner sin esta jerarquía —
-- un admin podía borrar al dueño con un DELETE crudo desde la consola del
-- navegador, sin pasar por ninguna RPC. Se enduce la policy con el mismo
-- criterio para que la RLS sea una barrera real, no solo "confiar en que
-- el cliente use la función correcta" (mismo espíritu que 0067, Fase 0).

-- ============================================================
-- 1. remove_member — la puerta real, con mensajes claros.
-- ============================================================
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

  delete from public.memberships
  where workspace_id = v_workspace_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

-- ============================================================
-- 2. RLS como segunda capa — mismo criterio que la función, expresado
--    directo sobre la fila (sin round-trip a otra tabla salvo
--    member_role, que ya es stable/security definer).
-- ============================================================
drop policy "memberships_delete_admin" on public.memberships;
create policy "memberships_delete_admin" on public.memberships
  for delete to authenticated using (
    public.is_admin_of(workspace_id)
    and user_id != auth.uid()
    and role != 'owner'
    and (role != 'admin' or public.member_role(workspace_id) = 'owner')
  );
