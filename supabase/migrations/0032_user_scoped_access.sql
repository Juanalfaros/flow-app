-- 0032_user_scoped_access.sql — parametriza el chequeo de acceso por usuario.
--
-- `can_access_space` resuelve el acceso del usuario de la sesion via
-- auth.uid(). El feed iCal (0033) lo sirve el Worker SIN sesion — se autentica
-- con el token de la URL, no con un JWT — asi que necesita preguntar "puede
-- ESTA persona ver este espacio" sin ser esa persona.
--
-- Se extrae la logica a una funcion que recibe el usuario, y can_access_space
-- queda como envoltorio de una linea. Asi las policies existentes no cambian y
-- hay UNA sola definicion de que significa tener acceso.
--
-- Escrita en plpgsql y no en sql: la version anterior era una sola expresion
-- con exists anidados dentro de un coalesce, dificil de leer y de auditar en
-- una funcion que decide quien ve que. Aca cada caso es un return explicito, y
-- ninguna rama puede devolver NULL por accidente — el bug que dejo abierto
-- invite_member (0020_null_safe_authz.sql). El costo es que plpgsql no se
-- inlinea en el planner; con ~15 usuarios y `stable` (que cachea por sentencia)
-- no es medible.

create or replace function public.can_user_access_space(p_user_id uuid, p_space_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_is_private boolean;
  v_role text;
begin
  select n.workspace_id, coalesce(n.is_private, false)
    into v_workspace_id, v_is_private
    from public.nodes n where n.id = p_space_id;

  -- Espacio inexistente: denegar. Sin este corte, un uuid inventado caeria en
  -- las ramas de abajo con v_workspace_id null.
  if v_workspace_id is null then
    return false;
  end if;

  select m.role into v_role
    from public.memberships m
   where m.workspace_id = v_workspace_id and m.user_id = p_user_id;

  -- No es del workspace.
  if v_role is null then
    return false;
  end if;

  -- Admin y owner ven todo: son quienes administran los accesos y necesitan
  -- poder recuperar un espacio al que nadie mas llega.
  if v_role in ('owner', 'admin') then
    return true;
  end if;

  -- Espacio abierto y rol con acceso amplio. Para restricted/guest, "abierto"
  -- NO significa visible: necesitan concesion explicita igual que en uno
  -- privado (ver 0031_restricted_roles.sql).
  if not v_is_private and v_role not in ('restricted', 'guest') then
    return true;
  end if;

  -- Concesion directa a la persona.
  if exists (
    select 1 from public.node_access a
     where a.space_id = p_space_id and a.subject_type = 'user' and a.subject_id = p_user_id
  ) then
    return true;
  end if;

  -- Concesion a traves de un equipo del que forma parte.
  if exists (
    select 1 from public.node_access a
     join public.team_members tm on tm.team_id = a.subject_id and tm.user_id = p_user_id
    where a.space_id = p_space_id and a.subject_type = 'team'
  ) then
    return true;
  end if;

  return false;
end;
$$;

-- Envoltorio: mismo contrato que usan todas las policies desde 0029, con una
-- sola fuente de verdad debajo.
create or replace function public.can_access_space(p_space_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_user_access_space(auth.uid(), p_space_id);
$$;

revoke execute on function public.can_user_access_space(uuid, uuid) from public, anon;
revoke execute on function public.can_access_space(uuid) from public, anon;
grant execute on function public.can_access_space(uuid) to authenticated;
