-- 0038_task_attachments.sql — metadata de adjuntos subidos a R2. Los bytes
-- viven en R2 (bucket `ATTACHMENTS`, ver worker/attachments.ts); esta tabla es
-- la única fuente de verdad de a qué nodo pertenece cada archivo y quién
-- puede verlo — la RLS de acá es lo que decide acceso, el Worker que sirve
-- los bytes solo la consulta, no reimplementa la regla (mismo criterio que
-- `/api/invite`: el Worker no decide autorización, la RPC/policy sí).

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  -- Key completa dentro del bucket R2: `{node_id}/{uuid}-{filename}` (ver
  -- worker/attachments.ts). Única porque el Worker la genera una sola vez
  -- por subida y esta fila es su único puntero — dos filas con la misma key
  -- significarían dos referencias al mismo objeto físico, que el borrado de
  -- una se llevaría el archivo de la otra por sorpresa.
  storage_key text not null unique,
  filename text not null,
  content_type text,
  size_bytes bigint not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_task_attachments_node_id on public.task_attachments(node_id);

alter table public.task_attachments enable row level security;

-- Mismo corte que comments/task_labels (0029): visible si se puede acceder
-- al nodo, sin importar si `space_id` es null (tarea personal) — ahí decide
-- `is_member_of`, igual que el resto de las policies de nodos sueltos.
create policy "task_attachments_select" on public.task_attachments
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = task_attachments.node_id
              and (n.space_id is null and public.is_member_of(n.workspace_id)
                   or public.can_access_node(n.id))));

create policy "task_attachments_insert_self" on public.task_attachments
  for insert to authenticated with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.nodes n
                where n.id = task_attachments.node_id
                  and (n.space_id is null and public.is_member_of(n.workspace_id)
                       or public.can_access_node(n.id))));

-- Solo quien lo subió, por ahora — sin "o admin" (a diferencia de
-- `comments_delete_own_or_admin`) porque el Worker que borra los bytes de R2
-- hace el mismo chequeo de dueño antes de dejar borrar la fila (ver
-- worker/attachments.ts): mantenerlos simétricos evita el caso "se borró la
-- fila pero el archivo de R2 quedó, porque el admin podía una cosa y no la
-- otra". Ampliar a admin es un cambio chico si hace falta más adelante —
-- requeriría además tocar el chequeo del Worker para no quedar asimétrico.
create policy "task_attachments_delete_own" on public.task_attachments
  for delete to authenticated using (uploaded_by = auth.uid());
