-- 0028_space_acl_data.sql — infraestructura para el control de acceso por
-- espacio. ADITIVA: no cambia ninguna policy, así que el comportamiento
-- observable es idéntico antes y después. La reescritura de RLS va en 0029,
-- separada a propósito para poder verificar el backfill primero.
--
-- ============================================================
-- El problema que resuelve `space_id`
-- ============================================================
-- La jerarquía real es `space > folder > … > project > task`, pero las tareas
-- top-level NO cuelgan de `parent_id`: su contenedor vive en
-- `node_memberships` (ver PLAN.md §4.2). O sea que responder "¿a qué espacio
-- pertenece este nodo?" requiere un recorrido recursivo que además cambia de
-- tabla a mitad de camino.
--
-- Hacer eso dentro de una policy de RLS significa ejecutarlo POR FILA en cada
-- select de tareas. Inviable. Por eso el espacio raíz se denormaliza en una
-- columna que mantiene un trigger, y la RLS pasa a ser un hop con índice.

alter table public.nodes add column space_id uuid references public.nodes(id) on delete cascade;
create index idx_nodes_space_id on public.nodes(space_id);

-- Solo tiene sentido en `type = 'space'`; en el resto de los nodos se ignora.
alter table public.nodes add column is_private boolean not null default false;

-- ============================================================
-- 1. Backfill
-- ============================================================
-- Un espacio es su propia raíz.
update public.nodes set space_id = id where type = 'space';

-- Descendientes por `parent_id`: se baja desde cada espacio arrastrando su id.
with recursive tree as (
  select id, id as root_space_id from public.nodes where type = 'space'
  union all
  select n.id, t.root_space_id from public.nodes n join tree t on n.parent_id = t.id
)
update public.nodes n set space_id = tree.root_space_id
from tree where n.id = tree.id and n.type <> 'space';

-- Tareas top-level: no tienen `parent_id`, su espacio sale del contenedor.
update public.nodes n set space_id = c.space_id
from public.node_memberships nm
join public.nodes c on c.id = nm.container_id
where n.id = nm.node_id and n.space_id is null and c.space_id is not null;

-- ============================================================
-- 2. Mantenimiento automático
-- ============================================================
create or replace function public.set_node_space_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.type = 'space' then
    -- En BEFORE INSERT el default de `id` ya se aplicó, así que está disponible.
    new.space_id := new.id;
  elsif new.parent_id is not null then
    select space_id into new.space_id from public.nodes where id = new.parent_id;
  end if;
  -- Tarea top-level (sin parent_id): la resuelve el trigger de
  -- node_memberships, que corre cuando se le asigna contenedor.
  return new;
end;
$$;

create trigger trg_set_node_space_id
  before insert or update of parent_id, type on public.nodes
  for each row execute function public.set_node_space_id();

-- Mover una carpeta a otro espacio tiene que re-enraizar todo su subárbol. Se
-- propaga hacia abajo: cada UPDATE dispara este mismo trigger en los hijos, y
-- la recursión termina sola porque la condición `is distinct from` corta
-- cuando el valor ya es el correcto. La profundidad real es de pocos niveles.
create or replace function public.propagate_node_space_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.nodes
  set space_id = new.space_id
  where parent_id = new.id and space_id is distinct from new.space_id;

  -- Tareas top-level que viven en este nodo como contenedor.
  update public.nodes n
  set space_id = new.space_id
  from public.node_memberships nm
  where nm.container_id = new.id and n.id = nm.node_id
    and n.parent_id is null and n.space_id is distinct from new.space_id;

  return null;
end;
$$;

create trigger trg_propagate_node_space_id
  after update of space_id on public.nodes
  for each row when (old.space_id is distinct from new.space_id)
  execute function public.propagate_node_space_id();

-- Cuando una tarea top-level entra a un contenedor (o se mueve a otro), hereda
-- el espacio de ese contenedor.
create or replace function public.set_membership_space_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.nodes n
  set space_id = c.space_id
  from public.nodes c
  where c.id = new.container_id and n.id = new.node_id
    and n.parent_id is null and n.space_id is distinct from c.space_id;
  return null;
end;
$$;

create trigger trg_set_membership_space_id
  after insert or update of container_id on public.node_memberships
  for each row execute function public.set_membership_space_id();

-- ============================================================
-- 3. Concesiones de acceso
-- ============================================================
-- El sujeto puede ser una persona o un equipo. No hay FK sobre `subject_id`
-- porque apunta a dos tablas distintas según `subject_type`; la integridad la
-- dan las policies (que exigen que el sujeto sea del mismo workspace) y el
-- `on delete cascade` de las tablas que sí referencian.
create table public.node_access (
  space_id uuid not null references public.nodes(id) on delete cascade,
  subject_type text not null check (subject_type in ('user', 'team')),
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (space_id, subject_type, subject_id)
);

-- La dirección que consulta la policy: "¿qué sujetos tienen acceso a este
-- espacio?" La PK ya lo cubre, pero este índice sirve al camino inverso
-- ("¿a qué espacios accede este sujeto?") que usa el panel de compartir.
create index idx_node_access_subject on public.node_access(subject_type, subject_id);

alter table public.node_access enable row level security;

-- Solo admin/owner del workspace del espacio gestiona los accesos. Es la
-- policy que evita que alguien se auto-conceda acceso a un espacio privado.
create policy "node_access_select_member" on public.node_access
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = node_access.space_id and public.is_member_of(n.workspace_id)));

create policy "node_access_write_admin" on public.node_access
  for all to authenticated
  using (
    exists (select 1 from public.nodes n
            where n.id = node_access.space_id and public.is_admin_of(n.workspace_id))
  ) with check (
    exists (select 1 from public.nodes n
            where n.id = node_access.space_id and public.is_admin_of(n.workspace_id))
    -- El sujeto tiene que pertenecer al mismo workspace que el espacio: sin
    -- esto se podría conceder acceso al uuid de alguien de otro workspace.
    and (
      (node_access.subject_type = 'user' and exists (
        select 1 from public.memberships m join public.nodes n on n.id = node_access.space_id
        where m.workspace_id = n.workspace_id and m.user_id = node_access.subject_id))
      or
      (node_access.subject_type = 'team' and exists (
        select 1 from public.teams t join public.nodes n on n.id = node_access.space_id
        where t.id = node_access.subject_id and t.workspace_id = n.workspace_id))
    )
  );

-- ============================================================
-- 4. La función que decide
-- ============================================================
-- `coalesce(..., false)` no es decorativo: un guard booleano que puede
-- devolver NULL no detiene a nadie, porque `if not NULL` nunca dispara. Es
-- exactamente el bug que hizo explotable `invite_member`
-- (ver 0020_null_safe_authz.sql).
--
-- `stable` permite que Postgres reutilice el resultado dentro de una misma
-- sentencia: en un select de 200 tareas del mismo espacio, se evalúa una vez.
create or replace function public.can_access_space(p_space_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce((
    select case
      -- Espacio público: cualquier miembro del workspace. Es el caso por
      -- defecto y el que mantiene el comportamiento actual intacto.
      when n.is_private is not true then public.is_member_of(n.workspace_id)
      -- Privado: admin siempre, más quien tenga concesión directa o por equipo.
      else public.is_admin_of(n.workspace_id)
        or exists (
          select 1 from public.node_access a
          where a.space_id = n.id and a.subject_type = 'user' and a.subject_id = auth.uid())
        or exists (
          select 1 from public.node_access a
          join public.team_members tm on tm.team_id = a.subject_id and tm.user_id = auth.uid()
          where a.space_id = n.id and a.subject_type = 'team')
    end
    from public.nodes n where n.id = p_space_id
  ), false);
$$;

revoke execute on function public.can_access_space(uuid) from public, anon;
grant execute on function public.can_access_space(uuid) to authenticated;
