-- 0035_project_acl_policies.sql — la RLS de lectura pasa a consultar la
-- frontera de acceso del propio nodo (`acl_boundary_id`, 0034), no solo la
-- del espacio. Mismo nivel de riesgo que 0029: toca las policies de las que
-- dependen board, list, gantt, calendario, mis tareas y la búsqueda.
--
-- Lo que la hace segura de desplegar: para cualquier nodo cuya
-- `acl_boundary_id` sea null (el caso de hoy, 100% de los proyectos —
-- ninguno está marcado privado todavía), `can_access_node(id)` resuelve
-- exactamente lo mismo que resolvía `can_access_space(space_id)` antes de
-- esta migración. El comportamiento observable no cambia hasta que alguien
-- marque un proyecto como privado.

-- ============================================================
-- 0. Guardia: sin backfill completo, esta migración no se aplica
-- ============================================================
do $$
declare
  v_orphans int;
begin
  -- El invariante que tiene que sostenerse siempre: todo nodo marcado
  -- privado es su propia frontera (ver `set_node_acl_boundary`, 0034). Si
  -- alguno no lo cumple, el backfill o el trigger tienen un bug — mejor
  -- abortar acá que aplicar policies que decidan acceso sobre datos
  -- inconsistentes.
  select count(*) into v_orphans
  from public.nodes n
  where n.is_private is true and n.acl_boundary_id is distinct from n.id;

  if v_orphans > 0 then
    raise exception
      'Backfill incompleto: % nodo(s) marcados privados cuya acl_boundary_id no es sí mismo. Revisar 0034.',
      v_orphans;
  end if;
end $$;

-- ============================================================
-- 1. has_node_access_grant — un solo lugar que consulta `node_access`,
--    directa o vía equipo. La usan can_access_node acá abajo y, más
--    adelante, cualquier UI que necesite saber "¿esta persona ya tiene
--    concesión sobre este nodo?" sin duplicar el `exists` dos veces.
-- ============================================================
create or replace function public.has_node_access_grant(p_node_id uuid, p_user_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.node_access a
    where a.node_id = p_node_id and a.subject_type = 'user' and a.subject_id = p_user_id
  ) or exists (
    select 1 from public.node_access a
    join public.team_members tm on tm.team_id = a.subject_id and tm.user_id = p_user_id
    where a.node_id = p_node_id and a.subject_type = 'team'
  );
$$;

revoke execute on function public.has_node_access_grant(uuid, uuid) from public, anon;
grant execute on function public.has_node_access_grant(uuid, uuid) to authenticated;

-- ============================================================
-- 2. can_access_node — la función que decide, generalizada
-- ============================================================
-- Dos ramas, según si hay o no una frontera privada en la cadena del nodo:
--
--   acl_boundary_id NO es null (hay un espacio o proyecto privado en el
--   camino, el más interno gana): la única entrada es la concesión sobre
--   ESA frontera. Ni el rol importa acá — un proyecto privado exige
--   concesión para cualquiera, admin aparte, igual que un espacio privado
--   hoy.
--
--   acl_boundary_id SÍ es null (nada marcado privado en toda la cadena):
--   los roles con acceso amplio entran solos. Los roles restringidos
--   (`restricted`/`guest`) necesitan concesión igual — sobre el ESPACIO,
--   porque es el único candidato posible cuando no hay nada más específico
--   marcado privado (0031_restricted_roles.sql, comportamiento sin cambios).
--   Esta es la única rama que consulta el rol: es la única que no se puede
--   resolver con datos precalculados por nodo, porque el rol es del usuario
--   que pregunta, no del nodo.
--
-- `coalesce(..., false)` al final: un guard booleano que puede devolver
-- NULL no detiene a nadie (0020_null_safe_authz.sql). `stable` deja que
-- Postgres lo evalúe una vez por nodo dentro de la misma sentencia.
create or replace function public.can_access_node(p_node_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce((
    select
      public.is_admin_of(n.workspace_id)
      or (
        public.is_member_of(n.workspace_id)
        and case
          when n.acl_boundary_id is not null then
            public.has_node_access_grant(n.acl_boundary_id, auth.uid())
          when coalesce(public.member_role(n.workspace_id), '') not in ('restricted', 'guest') then
            true
          else
            n.space_id is not null and public.has_node_access_grant(n.space_id, auth.uid())
        end
      )
    from public.nodes n where n.id = p_node_id
  ), false);
$$;

revoke execute on function public.can_access_node(uuid) from public, anon;
grant execute on function public.can_access_node(uuid) to authenticated;

-- can_access_space pasa a ser un envoltorio de una línea. Para un nodo
-- `type = 'space'`, `space_id = id` (0028) y `acl_boundary_id` ya resuelve
-- exactamente lo mismo que esta función resolvía antes de 0034 — así que las
-- ~10 policies que la siguen llamando con el `space_id` denormalizado de una
-- fila (comments, task_labels, activity_log, etc.) no necesitan tocarse.
create or replace function public.can_access_space(p_space_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select public.can_access_node(p_space_id);
$$;

revoke execute on function public.can_access_space(uuid) from public, anon;
grant execute on function public.can_access_space(uuid) to authenticated;

-- ============================================================
-- 3. Policies que sí necesitan mirar el nodo propio, no el espacio
-- ============================================================
-- Estas son las que deciden si SE VE la fila, y la fila puede ser un
-- proyecto (o algo colgado de él) más específicamente privado que su
-- espacio. Cambian de `can_access_space(n.space_id)` a `can_access_node(n.id)`
-- — mismo resultado hoy (nadie tiene un proyecto privado todavía), amplía el
-- chequeo el día que alguien lo marque.

-- nodes
drop policy "nodes_access" on public.nodes;
create policy "nodes_access" on public.nodes
  for all to authenticated
  using (
    case when space_id is null then public.is_member_of(workspace_id)
         else public.can_access_node(id) end
  )
  with check (
    case when space_id is null then public.is_member_of(workspace_id)
         else public.can_access_node(id) end
  );

-- node_memberships
drop policy "node_memberships_access" on public.node_memberships;
create policy "node_memberships_access" on public.node_memberships
  for all to authenticated
  using (
    exists (select 1 from public.nodes n
            where n.id = node_memberships.container_id and public.can_access_node(n.id))
  ) with check (
    exists (select 1 from public.nodes n
            where n.id = node_memberships.container_id and public.can_access_node(n.id))
    and exists (select 1 from public.nodes n2
                where n2.id = node_memberships.node_id
                  and (n2.space_id is null or public.can_access_node(n2.id)))
  );

-- statuses
drop policy "statuses_access" on public.statuses;
create policy "statuses_access" on public.statuses
  for all to authenticated
  using (
    exists (select 1 from public.nodes n
            where n.id = statuses.project_id and public.can_access_node(n.id))
  ) with check (
    exists (select 1 from public.nodes n
            where n.id = statuses.project_id and public.can_access_node(n.id)));

-- comments + comment_mentions
drop policy "comments_select" on public.comments;
drop policy "comments_insert_self" on public.comments;

create policy "comments_select" on public.comments
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = comments.node_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_node(n.id))));

create policy "comments_insert_self" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.nodes n
                where n.id = comments.node_id
                  and (n.space_id is null and public.is_member_of(n.workspace_id)
                       or public.can_access_node(n.id))));

drop policy "comment_mentions_select_member" on public.comment_mentions;
create policy "comment_mentions_select_member" on public.comment_mentions
  for select to authenticated using (
    exists (select 1 from public.comments c join public.nodes n on n.id = c.node_id
            where c.id = comment_mentions.comment_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_node(n.id))));

-- task_labels y task_dependencies
drop policy "task_labels_access" on public.task_labels;
create policy "task_labels_access" on public.task_labels
  for all to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = task_labels.node_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_node(n.id)))
  ) with check (
    exists (
      select 1 from public.nodes n join public.labels l on l.workspace_id = n.workspace_id
      where n.id = task_labels.node_id and l.id = task_labels.label_id
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_node(n.id))));

-- task_dependencies: `n.id` ya es literalmente `predecessor_id`/`successor_id`
-- — se llama can_access_node directo sobre la columna, sin el join intermedio
-- que 0029 necesitaba para pasar por can_access_space(n.space_id).
drop policy "task_dependencies_access" on public.task_dependencies;
create policy "task_dependencies_access" on public.task_dependencies
  for all to authenticated
  using (
    public.can_access_node(predecessor_id) and public.can_access_node(successor_id)
  )
  with check (
    predecessor_id <> successor_id
    and public.can_access_node(predecessor_id)
    and public.can_access_node(successor_id)
    and not public.would_create_cycle(predecessor_id, successor_id)
  );

-- activity_log
drop policy "activity_log_select_access" on public.activity_log;
create policy "activity_log_select_access" on public.activity_log
  for select to authenticated using (
    case
      when node_id is null then public.is_member_of(workspace_id)
      else exists (select 1 from public.nodes n
                   where n.id = activity_log.node_id
                     and (n.space_id is null and public.is_member_of(n.workspace_id)
                          or public.can_access_node(n.id)))
    end
  );
