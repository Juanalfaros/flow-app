-- 0046_reviewer_gate.sql — gate de revisor/aprobación: una tarea con
-- revisores asignados no puede completarse hasta que TODOS aprueben
-- (decisión ya cerrada con el usuario — no "con que uno apruebe alcanza").
--
-- No existe (ni puede modelarse limpio) un rol "revisor": `memberships.role`
-- es por workspace y único por (workspace, usuario) — no puede expresar
-- "revisor del proyecto X pero no del Y". Se modela como tabla propia,
-- mismo shape que task_assignees/task_watchers (0041/0043): la sola
-- presencia de una fila para un nodo YA significa "esta tarea necesita
-- revisión" — no hace falta una columna `requires_review` aparte, un
-- booleano no podría decir además QUIÉN tiene que aprobar.

create table public.task_reviewers (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (node_id, user_id)
);

create index idx_task_reviewers_node_id on public.task_reviewers(node_id);

alter table public.task_reviewers enable row level security;

-- Asignar/quitar revisor: mismo shape de RLS que task_assignees_access
-- (0041) — escritura directa, validado contra memberships.
create policy "task_reviewers_access" on public.task_reviewers
  for all to authenticated using (
    exists (
      select 1 from public.nodes n
      where n.id = task_reviewers.node_id
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_node(n.id))
    )
  ) with check (
    exists (
      select 1 from public.nodes n
      join public.memberships m on m.workspace_id = n.workspace_id
      where n.id = task_reviewers.node_id
        and m.user_id = task_reviewers.user_id
        and (n.space_id is null and public.is_member_of(n.workspace_id)
             or public.can_access_node(n.id))
    )
  );

-- Decidir (aprobar/rechazar) NO es un update directo del cliente por esta
-- misma policy de arriba (que permite `for all`, incluido update) — en la
-- práctica un revisor solo debería poder tocar su PROPIA fila de status,
-- no la de otro revisor ni reasignarse a sí mismo a una tarea distinta.
-- La RPC de abajo es el único camino soportado por el cliente para
-- cambiar `status`/`decided_at`; la policy de RLS queda como respaldo de
-- defensa en profundidad, no como el gate principal — mismo criterio que
-- ya documenta 0036_rpc_node_access_authz.sql para el resto de las RPCs.
create function public.has_unapproved_reviewers(p_node_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.task_reviewers where node_id = p_node_id and status != 'approved');
$$;

grant execute on function public.has_unapproved_reviewers(uuid) to authenticated;

create function public.decide_task_review(p_node_id uuid, p_approved boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_can_access_node(p_node_id);
  update public.task_reviewers
    set status = case when p_approved then 'approved' else 'rejected' end, decided_at = now()
  where node_id = p_node_id and user_id = auth.uid();
  if not found then
    raise exception 'No sos revisor de esta tarea' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.decide_task_review(uuid, boolean) to authenticated;

-- Segundo gate, independiente del de dependencias (0045) — trigger
-- separado (no fusionado en la misma función) para que cada uno se
-- pueda probar/desactivar por separado si hiciera falta.
create function public.enforce_reviewer_gate()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_new_kind text;
  v_old_kind text;
begin
  if new.type != 'task' then return new; end if;
  select status_kind into v_new_kind from public.statuses where id = new.status_id;
  select status_kind into v_old_kind from public.statuses where id = old.status_id;
  if v_new_kind = 'success' and v_old_kind is distinct from 'success'
     and public.has_unapproved_reviewers(new.id) then
    raise exception 'No se puede completar: falta aprobación de revisor'
      using errcode = 'GY002';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_reviewer_gate
  before update of status_id on public.nodes
  for each row execute function public.enforce_reviewer_gate();
