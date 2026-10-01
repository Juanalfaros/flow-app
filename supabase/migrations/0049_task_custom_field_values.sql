-- 0049_task_custom_field_values.sql — valores de campos personalizados
-- por tarea. Tabla nueva y normalizada, NO `nodes.custom_fields` jsonb:
--
-- Esa columna existe desde 0008_nodes_engine.sql, marcada YAGNI ahí mismo
-- ("sin índice GIN todavía... agregar cuando F5 implemente filtros por
-- campo personalizado, no antes") y hoy solo guarda `appearance` (ícono
-- del nodo, ver getNodeAppearance). Mezclar acá un sistema tipado real
-- habría obligado a desambiguar en cada lectura "¿esta clave es
-- apariencia o es un campo personalizado?", y cualquier contrato de tipo
-- (número vs. fecha vs. opción de un `select`) habría quedado sin validar
-- del lado del servidor — un jsonb sin esquema no puede tener un `with
-- check` que confirme "este valor es del tipo que declaró el campo".
-- Una tabla nueva sí puede: ver validate_custom_field_value más abajo.
-- `nodes.custom_fields` queda intacto, cero riesgo de migración sobre los
-- datos de apariencia existentes.

create table public.task_custom_field_values (
  node_id uuid not null references public.nodes(id) on delete cascade,
  field_id uuid not null references public.project_custom_fields(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (node_id, field_id)
);

create index idx_task_custom_field_values_field_id on public.task_custom_field_values(field_id);

create trigger trg_task_custom_field_values_updated_at
  before update on public.task_custom_field_values
  for each row execute function public.set_updated_at(); -- reusa la de 0001

-- Chequea que `value` tenga la forma que declara field_type — llamable
-- desde el `with check` de abajo, mismo espíritu que would_create_cycle
-- (0011) siendo invocable desde el `with check` de task_dependencies.
-- 'select': el valor debe ser el `id` de una de las `options` del campo,
-- no cualquier string — a diferencia de text/number/checkbox, que solo
-- validan el tipo jsonb crudo.
create function public.validate_custom_field_value(p_field_id uuid, p_value jsonb)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_type text;
  v_options jsonb;
begin
  select field_type, options into v_type, v_options from public.project_custom_fields where id = p_field_id;
  if v_type is null then return false; end if;

  return case v_type
    when 'text' then jsonb_typeof(p_value) = 'string'
    when 'number' then jsonb_typeof(p_value) = 'number'
    when 'checkbox' then jsonb_typeof(p_value) = 'boolean'
    -- Fecha en formato ISO (YYYY-MM-DD) — mismo formato que `nodes.due_date`
    -- serializa hacia el cliente. Validación de forma, no de fecha real
    -- calendario (31 de febrero pasaría) — suficiente acá, el cliente ya
    -- usa un date picker que no genera fechas inválidas.
    when 'date' then jsonb_typeof(p_value) = 'string' and p_value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
    when 'select' then
      jsonb_typeof(p_value) = 'string'
      and exists (select 1 from jsonb_array_elements(coalesce(v_options, '[]'::jsonb)) o
                  where o->>'id' = p_value #>> '{}')
    else false
  end;
end;
$$;

alter table public.task_custom_field_values enable row level security;

-- Escritura directa (patrón task_labels), con el chequeo de tipo en el
-- `with check` — mismo `node_id` que task_labels/task_assignees, mismo
-- compuesto de acceso.
create policy "task_custom_field_values_access" on public.task_custom_field_values
  for all to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = task_custom_field_values.node_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_node(n.id)))
  ) with check (
    exists (
      select 1 from public.nodes n
      where n.id = task_custom_field_values.node_id
        and public.validate_custom_field_value(task_custom_field_values.field_id, task_custom_field_values.value)
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_node(n.id)))
  );
