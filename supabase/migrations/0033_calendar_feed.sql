-- 0033_calendar_feed.sql — feed iCal por persona: sus tareas con fecha y sus
-- ausencias, para suscribir desde Google Calendar.
--
-- Sin OAuth ni tokens de Google: el calendario se suscribe a una URL y la lee
-- cada tanto. Eso evita guardar credenciales de terceros en la base, que es la
-- parte cara y riesgosa de una integracion real.
--
-- A cambio, la URL ES la credencial. De ahi el diseno: token largo por
-- persona, rotable, y el feed expone SOLO los datos de esa persona — sus
-- tareas asignadas y sus ausencias, no las del workspace. Si se filtra, el
-- dano queda acotado a una agenda.

create table public.calendar_feeds (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- 32 bytes en hex = 64 caracteres: seguro para URL y fuera del alcance de
  -- fuerza bruta. gen_random_bytes viene de pgcrypto (habilitado en 0001).
  token text not null unique,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz
);

alter table public.calendar_feeds enable row level security;

-- Solo la propia fila y solo lectura. Sin policies de escritura: el token se
-- crea y se rota por RPC, para que nadie pueda fijarse un token elegido por el
-- (que seria adivinable a proposito) ni leer el de otra persona.
create policy "calendar_feeds_select_own" on public.calendar_feeds
  for select to authenticated using (user_id = auth.uid());

create or replace function public.get_or_create_calendar_feed(p_workspace_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_token text;
begin
  perform public.assert_member_of(p_workspace_id);

  select cf.token into v_token from public.calendar_feeds cf where cf.user_id = auth.uid();
  if v_token is not null then
    return v_token;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.calendar_feeds (user_id, workspace_id, token)
  values (auth.uid(), p_workspace_id, v_token);
  return v_token;
end;
$$;

-- Rotar invalida la URL anterior de inmediato: es la salida cuando alguien
-- comparte el enlace por error.
create or replace function public.regenerate_calendar_feed(p_workspace_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_token text;
begin
  perform public.assert_member_of(p_workspace_id);
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.calendar_feeds (user_id, workspace_id, token)
  values (auth.uid(), p_workspace_id, v_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now();

  return v_token;
end;
$$;

revoke execute on function public.get_or_create_calendar_feed(uuid) from public, anon;
revoke execute on function public.regenerate_calendar_feed(uuid) from public, anon;
grant execute on function public.get_or_create_calendar_feed(uuid) to authenticated;
grant execute on function public.regenerate_calendar_feed(uuid) to authenticated;

-- ============================================================
-- Los eventos del feed
-- ============================================================
-- La consume el Worker con service_role. NO se concede a authenticated ni a
-- anon, asi que es inalcanzable desde el navegador: el token es a la vez el
-- unico argumento y la autenticacion.
--
-- Filtra por can_user_access_space (0032): alguien puede seguir asignado a una
-- tarea de un espacio al que perdio acceso — porque paso a rol restringido o
-- porque el espacio se hizo privado. Sin ese filtro, el feed seria una via
-- lateral para leer justo lo que la RLS acaba de cerrarle.
create or replace function public.calendar_feed_events(p_token text)
returns table (
  kind text,
  uid text,
  title text,
  starts_on date,
  ends_on date,
  due_time time,
  changed_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
begin
  select cf.user_id, cf.workspace_id into v_user_id, v_workspace_id
    from public.calendar_feeds cf where cf.token = p_token;

  -- Token invalido: se devuelve vacio, sin distinguir "no existe" de "no tiene
  -- eventos". Un 404 explicito confirmaria que el token es valido.
  if v_user_id is null then
    return;
  end if;

  update public.calendar_feeds set last_accessed_at = now() where token = p_token;

  return query
    select
      'task'::text,
      n.id::text,
      n.title,
      coalesce(n.start_date, n.due_date),
      n.due_date,
      n.due_time,
      n.updated_at
    from public.nodes n
    where n.workspace_id = v_workspace_id
      and n.type = 'task'
      and n.assignee_id = v_user_id
      and n.due_date is not null
      and (n.space_id is null or public.can_user_access_space(v_user_id, n.space_id))
    union all
    select
      'time_off'::text,
      t.id::text,
      case t.kind
        when 'vacaciones' then 'Vacaciones'
        when 'licencia' then 'Licencia'
        else coalesce(t.note, 'Ausencia')
      end,
      t.starts_on,
      t.ends_on,
      null::time,
      t.created_at
    from public.time_off t
    where t.user_id = v_user_id and t.workspace_id = v_workspace_id;
end;
$$;

revoke execute on function public.calendar_feed_events(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_events(text) to service_role;
