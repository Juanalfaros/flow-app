-- 0052_fix_nodes_insert_rls.sql — corrige un WITH CHECK auto-referencial
-- que bloqueaba TODO insert directo en `nodes` con `space_id` resuelto
-- (crear un espacio, crear una carpeta — cualquier cosa que no pase por
-- una RPC security definer como create_task_node/create_project_with_defaults).
--
-- ============================================================
-- El bug
-- ============================================================
-- `nodes_access` (0035) valida el INSERT con:
--
--   with check (case when space_id is null then is_member_of(workspace_id)
--                     else can_access_node(id) end)
--
-- `can_access_node(p_node_id)` hace `select ... from public.nodes n where
-- n.id = p_node_id` — una consulta APARTE que vuelve a buscar la fila por
-- id. Para un INSERT, esa fila todavía no es visible para esa subconsulta
-- en el momento en que el propio WITH CHECK de ESA MISMA sentencia la
-- evalúa (confirmado a mano: `can_access_node(id)` sí ve la fila recién
-- insertada si se llama en una sentencia POSTERIOR de la misma
-- transacción, pero no dentro del WITH CHECK de la sentencia que la crea
-- — es una limitación conocida de Postgres con políticas
-- auto-referenciales sobre INSERT). El resultado: la subconsulta no
-- encuentra ninguna fila, `can_access_node` cae al `coalesce(..., false)`
-- final, y CUALQUIER persona —admin/owner incluida— recibe 403 al crear
-- un espacio o una carpeta. Pasó inadvertido hasta ahora porque las
-- únicas dos rutas que hacían INSERT directo en `nodes` con `space_id`
-- no nulo (`createFolder`/`createSpace`, api.ts) no tenían UI hasta la
-- función "Crear espacios" — el resto (tareas, proyectos) pasa por RPCs
-- `security definer` que no evalúan esta policy.
--
-- ============================================================
-- El fix
-- ============================================================
-- `can_access_node_row` recibe las tres columnas que hacen falta
-- (`workspace_id`, `acl_boundary_id`, `space_id`) en vez de volver a
-- buscarlas por id. El WITH CHECK de `nodes` las lee directo de la fila
-- que está validando (NEW, ya con los valores que pusieron los triggers
-- `before insert` de 0028/0034) — cero subconsultas, cero problema de
-- visibilidad. `can_access_node(id)` sigue existiendo igual para el resto
-- de las policies (comments, statuses, node_memberships, etc.): ahí el
-- nodo referenciado SIEMPRE preexiste (no es la fila que se está
-- insertando), así que la subconsulta por id nunca tuvo este problema —
-- se deja intacta para no tocar más superficie de la necesaria, solo pasa
-- a apoyarse en el helper nuevo por dentro.

create or replace function public.can_access_node_row(
  p_workspace_id uuid, p_acl_boundary_id uuid, p_space_id uuid
) returns boolean
language sql security definer stable set search_path = public
as $$
  select
    public.is_admin_of(p_workspace_id)
    or (
      public.is_member_of(p_workspace_id)
      and case
        when p_acl_boundary_id is not null then
          public.has_node_access_grant(p_acl_boundary_id, auth.uid())
        when coalesce(public.member_role(p_workspace_id), '') not in ('restricted', 'guest') then
          true
        else
          p_space_id is not null and public.has_node_access_grant(p_space_id, auth.uid())
      end
    );
$$;

revoke execute on function public.can_access_node_row(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_access_node_row(uuid, uuid, uuid) to authenticated;

-- can_access_node(id) queda con el mismo contrato de siempre (mismo
-- resultado para toda fila que ya exista) — solo delega en el helper de
-- arriba en vez de repetir la lógica.
create or replace function public.can_access_node(p_node_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce((
    select public.can_access_node_row(n.workspace_id, n.acl_boundary_id, n.space_id)
    from public.nodes n where n.id = p_node_id
  ), false);
$$;

drop policy "nodes_access" on public.nodes;
create policy "nodes_access" on public.nodes
  for all to authenticated
  using (
    case when space_id is null then public.is_member_of(workspace_id)
         else public.can_access_node(id) end
  )
  with check (
    case when space_id is null then public.is_member_of(workspace_id)
         else public.can_access_node_row(workspace_id, acl_boundary_id, space_id) end
  );
