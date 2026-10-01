-- 0048_project_custom_fields.sql — definiciones de campos personalizados,
-- por proyecto (no por workspace): mismo criterio que `statuses.project_id`
-- (0001_init.sql) — un campo "Recinto" solo tiene sentido para un
-- proyecto de eventos puntual, no para todo el workspace. `nodes.custom_fields`
-- (jsonb, 0008) queda intacto: sigue usándose solo para apariencia de
-- ícono (getNodeAppearance) — esta migración no la toca, es un sistema
-- nuevo y separado, no una extensión de esa columna (ver 0049 para la
-- justificación completa de por qué los VALORES tampoco van ahí).

create table public.project_custom_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.nodes(id) on delete cascade,
  name text not null,
  field_type text not null check (field_type in ('text', 'number', 'date', 'select', 'checkbox')),
  -- Array de {id, label, color} — solo tiene sentido para field_type='select'.
  -- Sin CHECK cruzado acá (jsonb no puede depender de otra columna en un
  -- CHECK simple); se valida en validate_custom_field_value (0049), que sí
  -- corre con acceso a la fila completa.
  options jsonb,
  position numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

-- Mismo patrón que enforce_status_project_type (0008_nodes_engine.sql,
-- §7): project_id debe apuntar a un nodo type='project' — una FK simple
-- no puede expresar esa condición.
create function public.enforce_custom_field_project_type()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.nodes where id = new.project_id and type = 'project') then
    raise exception 'project_custom_fields.project_id (%) debe referenciar un nodo type=project', new.project_id;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_custom_field_project_type
  before insert or update of project_id on public.project_custom_fields
  for each row execute function public.enforce_custom_field_project_type();

alter table public.project_custom_fields enable row level security;

-- Mismo shape que la RLS de `statuses` (0035_project_acl_policies.sql):
-- todo miembro con acceso al proyecto puede gestionar sus campos.
create policy "project_custom_fields_access" on public.project_custom_fields
  for all to authenticated using (
    exists (select 1 from public.nodes n where n.id = project_custom_fields.project_id and public.can_access_node(n.id))
  ) with check (
    exists (select 1 from public.nodes n where n.id = project_custom_fields.project_id and public.can_access_node(n.id))
  );
