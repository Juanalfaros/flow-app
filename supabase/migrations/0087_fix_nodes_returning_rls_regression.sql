-- 0087_fix_nodes_returning_rls_regression.sql — 0084 (privacidad de
-- tareas personales) reescribió `nodes_access` para sumar
-- `can_access_personal_node` en la rama `space_id is null`, pero en la
-- rama `else` del USING volvió a dejar `can_access_node(id)`
-- (auto-referencial) en vez de `can_access_node_row(workspace_id,
-- acl_boundary_id, space_id)` — exactamente el bug que 0053 ya había
-- encontrado y arreglado para esta misma policy.
--
-- `can_access_node(id)` hace un SELECT propio contra `nodes` para
-- resolver `workspace_id`/`acl_boundary_id`/`space_id` a partir del
-- `id`. Para una fila DISTINTA y preexistente (el resto de las policies
-- que la usan) no hay problema. Pero acá `id` es la fila que la propia
-- policy está evaluando — y cuando ese USING corre para el RETURNING de
-- un `INSERT ... RETURNING` (`.insert().select()` de supabase-js,
-- createSpace/createFolder en api.ts), la fila recién insertada todavía
-- no es visible para una consulta SELECT independiente dentro del mismo
-- comando (no hay un CommandCounterIncrement de por medio) — el SELECT
-- interno no encuentra ninguna fila, `can_access_node` devuelve `false`,
-- y Postgres aborta el INSERT entero con "new row violates row-level
-- security policy for table nodes" (42501).
--
-- Reportado por el usuario como un 403 al crear un espacio nuevo.
-- Confirmado a mano (transacción de prueba, rollback): el mismo INSERT
-- sin `.select()` encadenado pasaba sin problema; con `.select()`
-- fallaba siempre, tanto para `createSpace` (parent_id null) como para
-- `createFolder` (parent_id de un nodo existente) — ambas usan el mismo
-- patrón `.insert().select().single()` en api.ts.
--
-- El fix: mismo que 0053, aplicado sobre la versión de 0084 — el USING
-- vuelve a llamar `can_access_node_row` directo con las columnas de la
-- fila (ya disponibles sin re-consultar la tabla), quedando simétrico
-- con el WITH CHECK. La rama `can_access_personal_node` de 0084 (nueva,
-- correcta) se mantiene intacta en ambas cláusulas.
drop policy "nodes_access" on public.nodes;
create policy "nodes_access" on public.nodes
  for all to authenticated
  using (
    case when space_id is null then public.can_access_personal_node(created_by, assignee_id, workspace_id)
         else public.can_access_node_row(workspace_id, acl_boundary_id, space_id) end
  )
  with check (
    case when space_id is null then public.can_access_personal_node(created_by, assignee_id, workspace_id)
         else public.can_access_node_row(workspace_id, acl_boundary_id, space_id) end
  );
