-- 0060_hidden_nodes.sql — "Ocultar espacio" (menú de espacio en el
-- sidebar). Calca favorites (0013_favorites.sql) al detalle: preferencia
-- por usuario, no un borrado ni un cambio de visibilidad para nadie más.
--
-- Ocultar solo aplica al ÁRBOL del sidebar — quien oculta un espacio
-- sigue teniendo acceso real a él (por URL directa, búsqueda, etc.), esto
-- es puramente "no lo quiero ver en mi barra lateral", igual que archivar
-- una conversación en un chat.

create table public.hidden_nodes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

create index idx_hidden_nodes_user_id on public.hidden_nodes(user_id);

alter table public.hidden_nodes enable row level security;

-- Sin política de update, mismo criterio que favorites: el toggle es
-- insert/delete, nunca se edita una fila existente.
create policy "hidden_nodes_select_own" on public.hidden_nodes
  for select to authenticated using (user_id = auth.uid());

create policy "hidden_nodes_insert_own" on public.hidden_nodes
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.nodes n where n.id = node_id and public.is_member_of(n.workspace_id))
  );

create policy "hidden_nodes_delete_own" on public.hidden_nodes
  for delete to authenticated using (user_id = auth.uid());
