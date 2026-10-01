-- 0079_custom_field_types_extended.sql — Nivel 2 de la auditoría de campos
-- personalizados (Nivel 1, ya en `main`: prominencia visual + color real
-- de las opciones, sin migración — solo cliente). Suma 5 tipos nuevos,
-- todos con la MISMA forma jsonb que uno
-- de los 2 tipos escalares que ya existen (string o number) — 'url'/
-- 'email'/'phone'/'longText' son texto, 'money' es número. Ningún tipo
-- nuevo necesita su propia columna/tabla (a diferencia de algo como
-- "Personas" o "Relación", que sí necesitarían un join table como
-- task_assignees/task_labels — deliberadamente fuera de este nivel).

alter table public.project_custom_fields drop constraint project_custom_fields_field_type_check;
alter table public.project_custom_fields
  add constraint project_custom_fields_field_type_check
  check (field_type in ('text', 'number', 'date', 'select', 'checkbox', 'url', 'money', 'longText', 'email', 'phone'));

-- Reemplaza validate_custom_field_value (0049) completa, no solo agrega un
-- `when` — la función original no tiene un mecanismo de "extender" un
-- `case`, así que se redeclara entera. url/email/phone/longText validan
-- igual que 'text' (jsonb_typeof = 'string', sin regex de formato: un
-- teléfono válido tiene demasiadas formas distintas según el país como
-- para que valga la pena una regex que rechace casos legítimos — mismo
-- criterio ya documentado acá mismo para 'date', que solo valida forma,
-- no validez calendario real). 'money' valida igual que 'number'.
create or replace function public.validate_custom_field_value(p_field_id uuid, p_value jsonb)
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
    when 'url' then jsonb_typeof(p_value) = 'string'
    when 'email' then jsonb_typeof(p_value) = 'string'
    when 'phone' then jsonb_typeof(p_value) = 'string'
    when 'longText' then jsonb_typeof(p_value) = 'string'
    when 'number' then jsonb_typeof(p_value) = 'number'
    when 'money' then jsonb_typeof(p_value) = 'number'
    when 'checkbox' then jsonb_typeof(p_value) = 'boolean'
    when 'date' then jsonb_typeof(p_value) = 'string' and p_value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
    when 'select' then
      jsonb_typeof(p_value) = 'string'
      and exists (select 1 from jsonb_array_elements(coalesce(v_options, '[]'::jsonb)) o
                  where o->>'id' = p_value #>> '{}')
    else false
  end;
end;
$$;
