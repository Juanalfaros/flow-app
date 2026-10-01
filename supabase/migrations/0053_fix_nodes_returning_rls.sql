-- 0053_fix_nodes_returning_rls.sql — 0052 arregló el WITH CHECK de
-- `nodes_access` pero dejó el USING intacto (`can_access_node(id)`,
-- auto-referencial). No alcanzaba: `createFolder`/`createSpace`
-- (api.ts) hacen `INSERT ... RETURNING` (`.insert().select().single()`
-- de supabase-js), y devolver las columnas del INSERT pasa por el mismo
-- USING que filtra un SELECT — que sufre el mismo problema de
-- visibilidad que 0052 documenta, solo que del lado de lectura en vez
-- de escritura. Confirmado a mano: el mismo INSERT sin `RETURNING` ya
-- pasaba con 0052 solo; con `RETURNING` seguía dando 42501.
--
-- El resto de las ~10 policies que llaman `can_access_node(id)` no
-- tienen este problema: siempre referencian un nodo DISTINTO y
-- preexistente (el proyecto de un status, el nodo de un comment, el
-- container de un node_membership) — nunca su propia fila recién
-- insertada. Este fix queda acotado a `nodes_access`, la única
-- policy genuinamente auto-referencial.

drop policy "nodes_access" on public.nodes;
create policy "nodes_access" on public.nodes
  for all to authenticated
  using (
    case when space_id is null then public.is_member_of(workspace_id)
         else public.can_access_node_row(workspace_id, acl_boundary_id, space_id) end
  )
  with check (
    case when space_id is null then public.is_member_of(workspace_id)
         else public.can_access_node_row(workspace_id, acl_boundary_id, space_id) end
  );
