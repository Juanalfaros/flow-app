-- 0041_task_assignees.sql — responsables múltiples por tarea.
--
-- Hasta ahora `nodes.assignee_id` (0008_nodes_engine.sql) era la única forma
-- de asignar una tarea: un uuid, un responsable. Esta migración agrega
-- `task_assignees`, una tabla muchos-a-muchos — mismo patrón que
-- `task_labels` (0001/0008/0035): escritura directa del cliente, sin RPC,
-- porque acá no hay ningún riesgo de divergencia posición/estado que
-- proteger (a diferencia de `node_memberships`, que sí necesita la RPC
-- `move_task_node` para mover posición y estado juntos).
--
-- `assignee_id` NO se elimina ni se reemplaza — sigue siendo el
-- "responsable principal" (a quién apunta el feed de Calendar de
-- 0033/0037, y a quién copia `generate_recurrence_on_completion` de 0021).
-- Se mantiene sincronizado con `task_assignees` por los 3 triggers de más
-- abajo, para que ningún call site existente (`create_task_node`,
-- `updateTaskFields`, el bulk-assign de `SelectionActionBar`) tenga que
-- aprender sobre la tabla nueva.

create table public.task_assignees (
  node_id uuid not null references public.nodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (node_id, user_id)
);

create index idx_task_assignees_user_id on public.task_assignees(user_id);
create index idx_task_assignees_node_id on public.task_assignees(node_id);

alter table public.task_assignees enable row level security;

-- Mismo shape que `task_labels_access` (0035_project_acl_policies.sql),
-- con un chequeo extra en el `with check`: `task_labels` valida que la
-- etiqueta sea del mismo workspace vía `l.workspace_id = n.workspace_id`,
-- pero acá no hay una fila "labels" del lado del usuario — se valida
-- directo contra `memberships`, para no poder asignar a alguien de otro
-- workspace.
create policy "task_assignees_access" on public.task_assignees
  for all to authenticated using (
    exists (
      select 1 from public.nodes n
      where n.id = task_assignees.node_id
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_node(n.id))
    )
  ) with check (
    exists (
      select 1 from public.nodes n
      join public.memberships m on m.workspace_id = n.workspace_id
      where n.id = task_assignees.node_id
        and m.user_id = task_assignees.user_id
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_node(n.id))
    )
  );

-- Backfill: cada assignee_id existente pasa a ser el primer (y por ahora
-- único) responsable de su tarea.
insert into public.task_assignees (node_id, user_id, created_at)
select id, assignee_id, created_at from public.nodes
where type = 'task' and assignee_id is not null;

-- ============================================================
-- Sincronización bidireccional
-- ============================================================

-- 1) Fijar assignee_id (en create_task_node, en updateTaskFields, en el
--    bulk-assign de SelectionActionBar) asegura una fila en
--    task_assignees — así ninguno de esos call sites necesita saber que
--    esta tabla existe.
create function public.sync_assignee_id_to_task_assignees()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.type = 'task' and new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into public.task_assignees (node_id, user_id, assigned_by)
    values (new.id, new.assignee_id, auth.uid())
    on conflict (node_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_sync_assignee_id_to_task_assignees
  after insert or update of assignee_id on public.nodes
  for each row execute function public.sync_assignee_id_to_task_assignees();

-- 2) Agregar a alguien vía task_assignees (el picker multi-responsable) lo
--    promueve a principal si la tarea todavía no tiene uno — "asignar
--    rápido" desde el avatar-stack alcanza solo, sin un paso aparte de
--    "elegir principal".
create function public.promote_first_assignee_to_principal()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.nodes set assignee_id = new.user_id
  where id = new.node_id and assignee_id is null;
  return new;
end;
$$;

create trigger trg_promote_first_assignee
  after insert on public.task_assignees
  for each row execute function public.promote_first_assignee_to_principal();

-- 3) Sacar al principal actual de task_assignees reasigna assignee_id a
--    quien quede (el más antiguo del pool), para que nunca apunte a
--    alguien que ya no es responsable de la tarea.
create function public.reassign_principal_on_assignee_removal()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_next uuid;
begin
  update public.nodes set assignee_id = null
  where id = old.node_id and assignee_id = old.user_id;

  select user_id into v_next from public.task_assignees
  where node_id = old.node_id
  order by created_at
  limit 1;

  if v_next is not null then
    update public.nodes set assignee_id = v_next where id = old.node_id and assignee_id is null;
  end if;
  return old;
end;
$$;

create trigger trg_reassign_principal_on_removal
  after delete on public.task_assignees
  for each row execute function public.reassign_principal_on_assignee_removal();
