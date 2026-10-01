-- 0026_time_off.sql — ausencias: vacaciones, licencias y otros períodos fuera.
--
-- Se guarda por rango de fechas y no por día suelto: una semana de vacaciones
-- es una fila, no siete. Con eso, "¿quién está fuera hoy?" es una comparación
-- de rango sobre un índice, y no hay que generar filas por adelantado.

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  kind text not null default 'vacaciones' check (kind in ('vacaciones', 'licencia', 'otro')),
  note text,
  created_at timestamptz not null default now(),
  -- Ambos extremos inclusive: un día suelto se guarda con starts_on = ends_on.
  constraint time_off_range_valid check (ends_on >= starts_on)
);

-- Cubre las dos consultas reales: "ausencias de esta persona" (ficha) y
-- "quién está fuera en este rango" (equipo), ambas por `user_id` primero.
create index idx_time_off_user_range on public.time_off(user_id, starts_on, ends_on);
create index idx_time_off_workspace on public.time_off(workspace_id, starts_on);

alter table public.time_off enable row level security;

-- ============================================================
-- RLS
-- ============================================================
-- Lectura para todo el workspace: saber quién está de vacaciones es justamente
-- para lo que sirve — si solo lo viera cada quien lo suyo, no habría forma de
-- planificar. La `note` es texto libre, así que la UI advierte que es visible
-- para el equipo.
create policy "time_off_select_member" on public.time_off
  for select to authenticated using (public.is_member_of(workspace_id));

-- Escritura: la propia, o la de cualquiera si sos admin. `with check` valida
-- las dos condiciones que la RLS no puede dar por sentadas: que la fila
-- pertenezca al workspace correcto y que quien la crea tenga derecho sobre esa
-- persona. Sin la segunda, alguien podría cargarle vacaciones a otro.
create policy "time_off_insert_own_or_admin" on public.time_off
  for insert to authenticated with check (
    public.is_member_of(workspace_id)
    and (user_id = auth.uid() or public.is_admin_of(workspace_id))
  );

create policy "time_off_update_own_or_admin" on public.time_off
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin_of(workspace_id))
  with check (
    public.is_member_of(workspace_id)
    and (user_id = auth.uid() or public.is_admin_of(workspace_id))
  );

create policy "time_off_delete_own_or_admin" on public.time_off
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin_of(workspace_id));

-- No se publica en realtime: las ausencias se cargan con semanas de
-- anticipación, no necesitan propagarse al instante. Refetch al montar, como
-- `favorites` (0013) y `teams` (0025).
