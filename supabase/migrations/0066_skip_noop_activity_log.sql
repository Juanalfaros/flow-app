-- 0066_skip_noop_activity_log.sql — log_node_activity() (0008) insertaba
-- una fila de 'task_updated' en CADA UPDATE de una tarea, incluso cuando
-- ningún campo real cambió — un guardado sin cambios (blur de un campo
-- sin editar, un "guardar" repetido) igual generaba una entrada de
-- actividad. Reportado por el usuario: la lista de "Actividad y
-- comentarios" de una tarea de UN DÍA ya tenía media docena de
-- "actualizó la tarea" sin ninguna información.
--
-- `NEW IS NOT DISTINCT FROM OLD` no sirve tal cual: `set_updated_at()`
-- (0001_init.sql, trigger BEFORE UPDATE) pisa `updated_at` en TODO
-- update, así que esa columna siempre difiere aunque nada más haya
-- cambiado. Se compara todo MENOS esa columna.

create or replace function public.log_node_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type != 'task' then return new; end if;
    insert into public.activity_log (workspace_id, node_id, actor_id, action, payload)
    values (new.workspace_id, new.id, auth.uid(), 'task_created', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    if new.type != 'task' then return new; end if;
    if (to_jsonb(new) - 'updated_at') is not distinct from (to_jsonb(old) - 'updated_at') then
      return new;
    end if;
    insert into public.activity_log (workspace_id, node_id, actor_id, action, payload)
    values (new.workspace_id, new.id, auth.uid(), 'task_updated',
            jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
  end if;
  return new;
end;
$$;
