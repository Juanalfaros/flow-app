-- 0024_profile_org_fields.sql — datos de organización en `profiles`: cargo,
-- zona horaria, gestor (para el organigrama) y última conexión.
--
-- Estas cuatro columnas son la base de /equipo: sin `job_title` las fichas de
-- persona muestran solo un nombre, sin `timezone` no se puede decir "10:46
-- hora local", y sin `manager_id` no hay organigrama que dibujar.

alter table public.profiles
  add column job_title text,
  -- Identificador IANA ('America/Santiago'), no un offset: los offsets se
  -- rompen con el horario de verano, que en Chile cambia dos veces al año.
  add column timezone text,
  add column manager_id uuid references public.profiles(id) on delete set null,
  add column last_seen_at timestamptz;

-- Parcial: el organigrama recorre hacia arriba por `manager_id`, y las filas
-- sin gestor (la raíz) nunca se buscan por esta columna.
create index idx_profiles_manager_id on public.profiles(manager_id) where manager_id is not null;

-- ============================================================
-- 1. Columnas que el cliente no puede escribir
-- ============================================================
-- `profiles_update_own` (0001_init.sql) es `for update using (auth.uid() = id)`
-- sin restricción de columnas. Alcanza para que cada quien edite su cargo y su
-- zona horaria —que es lo que queremos—, pero también dejaría que:
--   * cualquiera se cuelgue de quien quiera en el organigrama, o se saque de
--     su propia cadena de reporte (`manager_id`), y
--   * cualquiera se marque como conectado sin estarlo (`last_seen_at`).
--
-- Se extiende el trigger que ya congela `email` (0018_email_identity.sql) en
-- vez de agregar uno nuevo: mismo punto de control, misma lógica de "esta
-- columna es derivada, no editable desde el cliente".
--
-- `app.allow_manager_write` es la única puerta para `manager_id`, y solo la
-- abre `set_manager` (abajo). `current_setting(..., true)` devuelve null en
-- vez de lanzar cuando la marca no existe, y el `set_config` que la enciende
-- es local a la transacción, así que no puede filtrarse a otra sesión.
create or replace function public.protect_profile_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.email := old.email;
    new.last_seen_at := old.last_seen_at;
    if coalesce(current_setting('app.allow_manager_write', true), 'off') <> 'on' then
      new.manager_id := old.manager_id;
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 2. Ciclos en la cadena de reporte
-- ============================================================
-- Un ciclo (A reporta a B, B reporta a A) haría que el recorrido del
-- organigrama no termine nunca. Mismo problema y misma forma de resolverlo que
-- `would_create_cycle` para las dependencias de tareas (0011).
create or replace function public.manager_would_create_cycle(p_user_id uuid, p_manager_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive chain as (
    -- Se sube por la cadena desde el gestor propuesto: si en el camino aparece
    -- `p_user_id`, ese gestor ya depende de él y asignarlo cerraría el círculo.
    select p.id, p.manager_id from public.profiles p where p.id = p_manager_id
    union
    select p.id, p.manager_id from public.profiles p join chain c on p.id = c.manager_id
  )
  select coalesce(bool_or(chain.id = p_user_id), false) from chain;
$$;

-- ============================================================
-- 3. set_manager: la única vía para cambiar la cadena de reporte
-- ============================================================
create or replace function public.set_manager(p_user_id uuid, p_manager_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  -- Workspace que comparten quien edita y la persona editada. Si no comparten
  -- ninguno, queda null y `assert_admin_of` deniega — que es lo correcto:
  -- nadie administra el organigrama de otro workspace.
  select m.workspace_id into v_workspace_id
  from public.memberships m
  where m.user_id = p_user_id
    and exists (select 1 from public.memberships me
                where me.workspace_id = m.workspace_id and me.user_id = auth.uid())
  limit 1;

  perform public.assert_admin_of(v_workspace_id);

  if p_manager_id is not null then
    if p_manager_id = p_user_id then
      raise exception 'Una persona no puede ser su propio gestor' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.memberships
      where workspace_id = v_workspace_id and user_id = p_manager_id
    ) then
      raise exception 'El gestor debe pertenecer al mismo workspace' using errcode = '22023';
    end if;
    if public.manager_would_create_cycle(p_user_id, p_manager_id) then
      raise exception 'Ese cambio crearía un ciclo en el organigrama' using errcode = '22023';
    end if;
  end if;

  -- Abre el guard del trigger solo para este UPDATE. `is_local = true` (tercer
  -- argumento) lo ata a la transacción actual.
  perform set_config('app.allow_manager_write', 'on', true);
  update public.profiles set manager_id = p_manager_id where id = p_user_id;
  perform set_config('app.allow_manager_write', 'off', true);
end;
$$;

-- ============================================================
-- 4. Grants
-- ============================================================
-- Postgres concede EXECUTE a PUBLIC por defecto; sin el revoke, `anon` podría
-- llamar estas funciones (ver 0020_null_safe_authz.sql).
revoke execute on function public.set_manager(uuid, uuid) from public, anon;
revoke execute on function public.manager_would_create_cycle(uuid, uuid) from public, anon;
grant execute on function public.set_manager(uuid, uuid) to authenticated;
grant execute on function public.manager_would_create_cycle(uuid, uuid) to authenticated;
