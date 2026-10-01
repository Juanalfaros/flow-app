-- 0037_calendar_feed_node_access.sql — arregla lo que 0034 rompió sin avisar.
--
-- `node_access.space_id` se renombró a `node_id` en 0034. Postgres actualiza
-- solas las policies y la PK (referencian por número de atributo), pero NO
-- reescribe cuerpos de función `plpgsql` — se guardan como texto y se
-- resuelven recién al ejecutarse. `can_user_access_space` (0032) sigue
-- diciendo `a.space_id` adentro: columna que ya no existe.
--
-- No lo agarró ningún chequeo porque `create function` no valida nombres de
-- columna contra el catálogo al crearse, solo sintaxis. La migración aplica
-- sin quejarse; el primer `select` real contra `node_access.space_id` explota
-- en tiempo de ejecución con "column a.space_id does not exist".
--
-- Tiene un solo llamador vivo: `calendar_feed_events` (0033), que la usa
-- porque corre sin sesión (el feed iCal se autentica con el token de la URL,
-- no con un JWT) — necesita preguntar "¿puede ESTA persona ver este nodo?"
-- sin ser esa persona, algo que `can_access_node` (0035, apoyada en
-- `auth.uid()`) no puede resolver desde `service_role`.
--
-- Segundo problema, independiente del rename: `calendar_feed_events` filtra
-- por `n.space_id` — que después de 0034 ya NO es la frontera de acceso real
-- de una tarea. Una tarea dentro de un proyecto marcado privado (frontera más
-- específica que su espacio) seguiría apareciendo en el feed de alguien que
-- perdió acceso a ESE proyecto en particular, aunque conserve acceso al
-- espacio. Se corrige de una: el reemplazo consulta por `n.id`, la misma
-- tarea, no por su espacio.
--
-- Se reemplaza en vez de repararse in place: `can_user_access_space` ya no
-- tiene sentido como nombre (el chequeo es por nodo, no por espacio) y solo
-- la usa este único caller — no hay razón para mantener las dos.

drop function if exists public.can_user_access_space(uuid, uuid);

-- Mismo criterio de 0032 para elegir plpgsql sobre sql: cada rama es un
-- `return` explícito, ninguna puede devolver NULL por accidente (el bug que
-- dejó abierto `invite_member`, 0020_null_safe_authz.sql). La lógica es la
-- de `can_access_node` (0035), pero con el usuario como parámetro en vez de
-- `auth.uid()` — por eso no puede ser simplemente `can_access_node` con un
-- `set role`: `service_role` no tiene una sesión de la que auth.uid() pueda
-- leer, y no hay que confiar en el caller para eso.
create or replace function public.can_user_access_node(p_user_id uuid, p_node_id uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_acl_boundary_id uuid;
  v_space_id uuid;
  v_role text;
begin
  select n.workspace_id, n.acl_boundary_id, n.space_id
    into v_workspace_id, v_acl_boundary_id, v_space_id
    from public.nodes n where n.id = p_node_id;

  -- Nodo inexistente: denegar, no dejar que v_workspace_id null caiga en las
  -- ramas de abajo (mismo corte que can_user_access_space original).
  if v_workspace_id is null then
    return false;
  end if;

  select m.role into v_role
    from public.memberships m
   where m.workspace_id = v_workspace_id and m.user_id = p_user_id;

  if v_role is null then
    return false;
  end if;

  if v_role in ('owner', 'admin') then
    return true;
  end if;

  -- Hay una frontera privada (el nodo mismo, o el ancestro privado más
  -- cercano): manda esa, sin importar el rol — igual que can_access_node.
  if v_acl_boundary_id is not null then
    return public.has_node_access_grant(v_acl_boundary_id, p_user_id);
  end if;

  -- Nada marcado privado en toda la cadena: los roles con acceso amplio
  -- entran solos. Los restringidos necesitan concesión sobre el espacio
  -- igual (0031), único candidato posible cuando no hay nada más específico.
  if v_role not in ('restricted', 'guest') then
    return true;
  end if;

  return v_space_id is not null and public.has_node_access_grant(v_space_id, p_user_id);
end;
$$;

-- Sin grant a `authenticated` a propósito, igual que la función que
-- reemplaza: "¿puede la persona X ver el nodo Y?" para un X arbitrario es
-- información que ningún cliente debería poder preguntar sobre otra
-- persona. Solo la alcanza `service_role` (vía `calendar_feed_events`,
-- que corre como su propio owner al ser `security definer`) o una futura
-- función igual de acotada — nunca una sesión de usuario directamente.
revoke execute on function public.can_user_access_node(uuid, uuid) from public, anon, authenticated;

-- calendar_feed_events: mismo cuerpo que 0033, con el filtro corregido.
create or replace function public.calendar_feed_events(p_token text)
returns table (
  kind text,
  uid text,
  title text,
  starts_on date,
  ends_on date,
  due_time time,
  changed_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
begin
  select cf.user_id, cf.workspace_id into v_user_id, v_workspace_id
    from public.calendar_feeds cf where cf.token = p_token;

  if v_user_id is null then
    return;
  end if;

  update public.calendar_feeds set last_accessed_at = now() where token = p_token;

  return query
    select
      'task'::text,
      n.id::text,
      n.title,
      coalesce(n.start_date, n.due_date),
      n.due_date,
      n.due_time,
      n.updated_at
    from public.nodes n
    where n.workspace_id = v_workspace_id
      and n.type = 'task'
      and n.assignee_id = v_user_id
      and n.due_date is not null
      -- Por la tarea misma (n.id), no por su espacio (n.space_id): una
      -- tarea puede estar detrás de un proyecto privado más específico que
      -- su espacio, y ese es el corte que importa acá.
      and (n.space_id is null or public.can_user_access_node(v_user_id, n.id))
    union all
    select
      'time_off'::text,
      t.id::text,
      case t.kind
        when 'vacaciones' then 'Vacaciones'
        when 'licencia' then 'Licencia'
        else coalesce(t.note, 'Ausencia')
      end,
      t.starts_on,
      t.ends_on,
      null::time,
      t.created_at
    from public.time_off t
    where t.user_id = v_user_id and t.workspace_id = v_workspace_id;
end;
$$;

revoke execute on function public.calendar_feed_events(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_events(text) to service_role;
