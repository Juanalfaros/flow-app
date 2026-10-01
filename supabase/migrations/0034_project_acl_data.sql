-- 0034_project_acl_data.sql — generaliza el control de acceso de "solo
-- espacio" a "espacio o proyecto". ADITIVA: ninguna policy cambia todavía
-- (eso va en 0035), así que el comportamiento observable es idéntico antes y
-- después. Mismo criterio de secuencia que 0028/0029.
--
-- ============================================================
-- El problema que resuelve `acl_boundary_id`
-- ============================================================
-- Hoy `node_access` solo puede apuntar a un espacio, y `nodes.space_id`
-- (0028) siempre denormaliza la RAÍZ del árbol — nunca un proyecto
-- intermedio. Eso es intencional para performance (un hop con índice en vez
-- de una recursión por fila), pero significa que "compartir esta lista"
-- (ShareDialog.tsx, "Hacer privado") no tiene dónde apoyarse: no existe un
-- concepto de "el proyecto más cercano marcado privado".
--
-- `acl_boundary_id` es ese concepto, denormalizado igual que `space_id`: para
-- cada nodo, el id del ancestro privado más cercano (o el nodo mismo si él
-- mismo está marcado privado), o `null` si nada en toda la cadena —hasta el
-- espacio inclusive— está marcado privado. El nombre es a propósito genérico
-- ("acl", no "space" ni "project"): el mismo campo sirve para un espacio
-- privado, un proyecto privado dentro de un espacio abierto, o (aunque hoy
-- ningún cliente lo expone) una tarea marcada privada — la UI de 0035 en
-- adelante solo prende el interruptor para espacios y proyectos, pero el
-- modelo no lo restringe a nivel de columna.
--
-- Con esto, "el más interno gana": un proyecto privado dentro de un espacio
-- abierto exige su propia concesión sin tocar nada del espacio; un proyecto
-- SIN marca propia dentro de un espacio privado hereda la frontera del
-- espacio (mismo comportamiento que hoy). Ver 0035 para la función que lo
-- consume.

alter table public.nodes add column acl_boundary_id uuid references public.nodes(id) on delete cascade;
create index idx_nodes_acl_boundary_id on public.nodes(acl_boundary_id);

-- ============================================================
-- 1. Backfill
-- ============================================================
-- Espacios: frontera = sí mismo si privado, si no null. Se corre primero y
-- por separado porque el paso 2 lee este valor ya resuelto como caso base.
update public.nodes set acl_boundary_id = case when is_private then id else null end
where type = 'space';

-- Descendientes por `parent_id`: heredan la frontera del padre, salvo que el
-- propio nodo esté marcado privado — ahí la frontera es él mismo, sin
-- importar qué frontera traía el padre.
with recursive tree as (
  select id, acl_boundary_id as boundary from public.nodes where type = 'space'
  union all
  select n.id, (case when n.is_private then n.id else t.boundary end)
  from public.nodes n join tree t on n.parent_id = t.id
)
update public.nodes n set acl_boundary_id = tree.boundary
from tree where n.id = tree.id and n.type <> 'space';

-- Tareas top-level (sin `parent_id`, contenedor vía `node_memberships`):
-- heredan la frontera de su contenedor. Las tareas personales (sin
-- contenedor) quedan sin frontera, correcto: no tienen espacio tampoco.
update public.nodes n set acl_boundary_id = c.acl_boundary_id
from public.node_memberships nm
join public.nodes c on c.id = nm.container_id
where n.id = nm.node_id and n.parent_id is null and n.type <> 'space';

-- ============================================================
-- 2. Mantenimiento automático — mismo patrón que set_node_space_id (0028),
--    pero además reacciona a `is_private` (que ahí no hacía falta: la
--    privacidad de un espacio se leía directo, sin denormalizar).
-- ============================================================
create or replace function public.set_node_acl_boundary()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.is_private then
    new.acl_boundary_id := new.id;
  elsif new.parent_id is not null then
    select acl_boundary_id into new.acl_boundary_id from public.nodes where id = new.parent_id;
  else
    -- Nodo top-level sin padre: sin frontera propia hasta que
    -- trg_set_membership_acl_boundary le asigne un contenedor (o para
    -- siempre, si es una tarea personal).
    new.acl_boundary_id := null;
  end if;
  return new;
end;
$$;

create trigger trg_set_node_acl_boundary
  before insert or update of parent_id, type, is_private on public.nodes
  for each row execute function public.set_node_acl_boundary();

-- Propaga hacia abajo cuando la frontera de un nodo cambia (se movió, o pasó
-- a privado/público). El guard `is_private is not true` es la pieza que hace
-- "el más interno gana": un hijo que está marcado privado por su cuenta NUNCA
-- se pisa con la frontera del padre, conserva la suya.
create or replace function public.propagate_node_acl_boundary()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.nodes
  set acl_boundary_id = new.acl_boundary_id
  where parent_id = new.id and is_private is not true
    and acl_boundary_id is distinct from new.acl_boundary_id;

  update public.nodes n
  set acl_boundary_id = new.acl_boundary_id
  from public.node_memberships nm
  where nm.container_id = new.id and n.id = nm.node_id
    and n.parent_id is null and n.is_private is not true
    and n.acl_boundary_id is distinct from new.acl_boundary_id;

  return null;
end;
$$;

create trigger trg_propagate_node_acl_boundary
  after update of acl_boundary_id on public.nodes
  for each row when (old.acl_boundary_id is distinct from new.acl_boundary_id)
  execute function public.propagate_node_acl_boundary();

-- Tarea top-level que entra a un contenedor (o cambia de contenedor): hereda
-- la frontera de ese contenedor, salvo que ella misma esté marcada privada.
create or replace function public.set_membership_acl_boundary()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.nodes n
  set acl_boundary_id = c.acl_boundary_id
  from public.nodes c
  where c.id = new.container_id and n.id = new.node_id
    and n.parent_id is null and n.is_private is not true
    and n.acl_boundary_id is distinct from c.acl_boundary_id;
  return null;
end;
$$;

create trigger trg_set_membership_acl_boundary
  after insert or update of container_id on public.node_memberships
  for each row execute function public.set_membership_acl_boundary();

-- ============================================================
-- 3. Generalizar `node_access` de "solo espacios" a "cualquier nodo"
-- ============================================================
-- Solo el nombre de columna cambia — la PK, el índice y las policies de 0028
-- siguen funcionando igual: Postgres actualiza las referencias internas
-- (policies, PK) por posición de atributo, no por texto, así que no hace
-- falta recrear nada de eso. Se renombra también el nombre de la constraint
-- de FK para que no quede desalineado con la columna.
alter table public.node_access rename column space_id to node_id;
alter table public.node_access rename constraint node_access_space_id_fkey to node_access_node_id_fkey;

comment on column public.node_access.node_id is
  'Nodo al que aplica la concesión: un espacio o un proyecto marcado is_private. Antes de 0034 solo podía ser un espacio.';
comment on column public.nodes.acl_boundary_id is
  'Ancestro privado más cercano (o el propio nodo), o null si nada en la cadena está marcado privado. Mantenido por trigger, ver 0034.';
