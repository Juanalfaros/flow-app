-- 0031_restricted_roles.sql — los roles restringidos empiezan a restringir.
--
-- Hasta acá, `memberships.role` distinguía owner/admin/member/guest pero la RLS
-- solo miraba dos niveles: `is_member_of` (cualquier rol) e `is_admin_of`
-- (owner/admin). O sea que un "Invitado" tenía exactamente la misma escritura
-- total sobre todos los nodos que un Miembro — por eso la UI los mostraba
-- deshabilitados con badge "Pronto", para no prometer una restricción
-- inexistente.
--
-- Con la capa de acceso por espacio (0028/0029) ya construida, ahora sí hay
-- dónde apoyarlos.

-- ============================================================
-- 1. 'restricted' como rol válido
-- ============================================================
-- El CHECK original (0001_init.sql) no lo contemplaba, así que `invite_member`
-- lo habría rechazado aunque la UI lo ofreciera.
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner', 'admin', 'member', 'restricted', 'guest'));

-- `invite_member` valida el rol por su cuenta (0004/0020): hay que sumarlo ahí
-- también, si no rechaza con "Rol inválido".
create or replace function public.invite_member(p_workspace_id uuid, p_email text, p_role text)
returns public.invitations
language plpgsql security definer set search_path = public
as $$
declare v_invitation public.invitations;
begin
  perform public.assert_admin_of(p_workspace_id);

  if p_role not in ('admin', 'member', 'restricted', 'guest') then
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

-- El CHECK de `invitations.role` (0001) tampoco incluía 'restricted'.
alter table public.invitations drop constraint invitations_role_check;
alter table public.invitations add constraint invitations_role_check
  check (role in ('admin', 'member', 'restricted', 'guest'));

-- ============================================================
-- 2. can_access_space contempla el rol, no solo la privacidad del espacio
-- ============================================================
-- Son dos dimensiones independientes y hay que cruzarlas:
--
--                        | espacio público      | espacio privado
--   ---------------------|----------------------|------------------------
--   owner / admin        | sí                   | sí
--   member               | sí                   | solo con concesión
--   restricted / guest   | solo con concesión   | solo con concesión
--
-- O sea: para los roles restringidos, "público" deja de significar "abierto a
-- todo el workspace". Solo ven los espacios que les compartieron — que es
-- exactamente lo que la UI venía describiendo sin poder cumplir.
--
-- `coalesce(..., false)` al final, otra vez a propósito: un guard booleano que
-- puede devolver NULL no detiene a nadie (ver 0020_null_safe_authz.sql).
-- `stable` deja que Postgres lo evalúe una vez por espacio y no por fila.
create or replace function public.can_access_space(p_space_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce((
    select
      -- Admin y owner ven todo, siempre: son quienes administran los accesos y
      -- necesitan poder recuperar un espacio al que nadie más llega.
      public.is_admin_of(n.workspace_id)
      or (
        public.is_member_of(n.workspace_id)
        and (
          -- Espacio público y rol con acceso amplio.
          (
            n.is_private is not true
            and coalesce(public.member_role(n.workspace_id), '') not in ('restricted', 'guest')
          )
          -- O concesión explícita, directa…
          or exists (
            select 1 from public.node_access a
            where a.space_id = n.id and a.subject_type = 'user' and a.subject_id = auth.uid())
          -- …o a través de un equipo.
          or exists (
            select 1 from public.node_access a
            join public.team_members tm on tm.team_id = a.subject_id and tm.user_id = auth.uid()
            where a.space_id = n.id and a.subject_type = 'team')
        )
      )
    from public.nodes n where n.id = p_space_id
  ), false);
$$;

revoke execute on function public.can_access_space(uuid) from public, anon;
grant execute on function public.can_access_space(uuid) to authenticated;

-- ============================================================
-- 3. Nota de despliegue
-- ============================================================
-- Nadie tiene rol 'restricted' ni 'guest' hoy, así que esta migración no le
-- cambia el acceso a ninguna persona existente: la rama nueva del `case` solo
-- se evalúa para roles que todavía no se usan. El cambio de comportamiento
-- empieza recién cuando se invite a alguien con uno de esos roles, o se marque
-- un espacio como privado.
