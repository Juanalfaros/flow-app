-- 0027_presence.sql — presencia: quién está conectado ahora y cuánto estuvo
-- conectado cada día.
--
-- ============================================================
-- Por qué un resumen diario y no un historial de sesiones
-- ============================================================
-- La forma obvia de "cuánta gente estuvo conectada el martes" es guardar
-- heartbeats y contarlos. Con 15 personas latiendo cada 30 s durante 8 horas
-- son ~14.000 filas por día, ~5 millones al año, para responder una pregunta
-- que se contesta con una fila por persona por día.
--
-- Acá se guarda directamente esa fila: `presence_daily` tiene PK (user_id,
-- day), así que ~15 filas diarias y ~5.500 al año. Tres órdenes de magnitud
-- menos, en un proyecto que corre en el tier gratuito de Supabase.
--
-- Y el rollup ocurre dentro de la misma RPC que marca la presencia, así que no
-- hace falta ningún cron nuevo en el Worker de Cloudflare.
--
-- La presencia EN VIVO ("Conectado" con el punto verde) no pasa por acá: es un
-- canal de Realtime, sin escrituras en base (ver features/people/use-workspace-presence.ts).

create table public.presence_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day date not null,
  -- Minutos acumulados, en incrementos del intervalo con que late el cliente.
  -- Es una aproximación por diseño: mide "estuvo con la app abierta", que es la
  -- pregunta que la vista responde, no tiempo de trabajo efectivo.
  minutes_online int not null default 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  primary key (user_id, day)
);

create index idx_presence_daily_workspace_day on public.presence_daily(workspace_id, day);

alter table public.presence_daily enable row level security;

-- Lectura para el workspace (la vista de análisis es del equipo). Sin policies
-- de escritura para `authenticated`: la única que escribe es la RPC de abajo,
-- que es security definer — mismo criterio que `activity_log` (0001) y
-- `notifications` (0016). Si el cliente pudiera escribir, cualquiera podría
-- inflar sus propios minutos.
create policy "presence_daily_select_member" on public.presence_daily
  for select to authenticated using (public.is_member_of(workspace_id));

-- ============================================================
-- El guard de `profiles` tiene que dejar pasar a touch_presence
-- ============================================================
-- `protect_profile_email` (0024) congela `last_seen_at` cuando hay un usuario
-- JWT en contexto, justamente para que nadie se marque como conectado sin
-- estarlo. Pero `touch_presence` corre EN esa sesión —es una RPC llamada por el
-- cliente, con su JWT— así que el trigger también le revertiría el update.
--
-- Se reusa el mismo mecanismo que ya existe para `manager_id`: una marca de
-- sesión que solo la RPC de confianza enciende, local a la transacción.
create or replace function public.protect_profile_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.email := old.email;
    if coalesce(current_setting('app.allow_manager_write', true), 'off') <> 'on' then
      new.manager_id := old.manager_id;
    end if;
    if coalesce(current_setting('app.allow_presence_write', true), 'off') <> 'on' then
      new.last_seen_at := old.last_seen_at;
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- touch_presence: marca actividad y acumula el día, en una sola llamada
-- ============================================================
-- El cliente la llama con throttle (ver use-workspace-presence.ts). El
-- parámetro `p_interval_minutes` es cuánto suma cada latido: viaja desde el
-- cliente para que ambos lados usen el mismo número, pero se acota acá porque
-- es entrada del usuario — sin el `least`, alguien podría llamar con 10.000 y
-- aparecer con jornadas imposibles.
create or replace function public.touch_presence(p_workspace_id uuid, p_interval_minutes int default 5)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_minutes int;
  v_now timestamptz := now();
begin
  perform public.assert_member_of(p_workspace_id);

  v_minutes := least(greatest(coalesce(p_interval_minutes, 5), 1), 15);

  perform set_config('app.allow_presence_write', 'on', true);
  update public.profiles set last_seen_at = v_now where id = auth.uid();
  perform set_config('app.allow_presence_write', 'off', true);

  insert into public.presence_daily as pd (user_id, workspace_id, day, minutes_online, first_seen_at, last_seen_at)
  values (auth.uid(), p_workspace_id, (v_now at time zone 'UTC')::date, v_minutes, v_now, v_now)
  on conflict (user_id, day) do update
    set minutes_online = pd.minutes_online + v_minutes,
        last_seen_at = v_now,
        -- `first_seen_at` no se pisa: es el primer latido del día.
        first_seen_at = coalesce(pd.first_seen_at, v_now);
end;
$$;

revoke execute on function public.touch_presence(uuid, int) from public, anon;
grant execute on function public.touch_presence(uuid, int) to authenticated;
