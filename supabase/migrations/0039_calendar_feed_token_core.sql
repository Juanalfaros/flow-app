-- 0039_calendar_feed_token_core.sql — genera el token del feed iCal sin
-- depender de pgcrypto.
--
-- ============================================================
-- El fallo
-- ============================================================
-- `get_or_create_calendar_feed` y `regenerate_calendar_feed` (0033) usaban
-- `gen_random_bytes(32)`, que pertenece a **pgcrypto**. En Supabase las
-- extensiones se instalan en el esquema `extensions`, no en `public`, y ambas
-- funciones declaran `set search_path = public` — que lo excluye. Resultado:
--
--   42883: function gen_random_bytes(integer) does not exist
--
-- El comentario original decía que estaba disponible "porque pgcrypto está
-- habilitado en 0001". El razonamiento era falso, y pasó inadvertido porque
-- `gen_random_uuid()` —que sí se usa en todo el proyecto— es parte del núcleo
-- de Postgres desde la 13, no de pgcrypto. O sea que el resto funcionaba por
-- un motivo distinto al que el comentario suponía.
--
-- ============================================================
-- Por qué no se arregla ampliando el search_path
-- ============================================================
-- Agregar `extensions` al `search_path` sería lo idiomático en Supabase, pero
-- estas son funciones `security definer`: el `set search_path` fijo es
-- justamente lo que las protege de search_path hijacking (ver la nota de
-- 0003_rls.sql). Ampliarlo por una sola llamada agrega superficie sin
-- necesidad.
--
-- Dos `gen_random_uuid()` concatenados dan exactamente los mismos 64
-- caracteres hex que producía `encode(gen_random_bytes(32), 'hex')`, así que
-- el formato del token no cambia y la validación del Worker
-- (`^[a-f0-9]{64}$`) sigue valiendo. Entropía: cada UUID v4 aporta 122 bits
-- aleatorios, 244 en total — de sobra para un token de portador, y muy por
-- encima de lo que hace falta para que no se pueda adivinar.
--
-- No hay tokens que migrar: la función nunca llegó a insertar una fila, así
-- que `calendar_feeds` está vacía.

create or replace function public.new_calendar_feed_token()
returns text
language sql volatile set search_path = public
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

revoke execute on function public.new_calendar_feed_token() from public, anon, authenticated;

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

  v_token := public.new_calendar_feed_token();
  insert into public.calendar_feeds (user_id, workspace_id, token)
  values (auth.uid(), p_workspace_id, v_token);
  return v_token;
end;
$$;

create or replace function public.regenerate_calendar_feed(p_workspace_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_token text;
begin
  perform public.assert_member_of(p_workspace_id);
  v_token := public.new_calendar_feed_token();

  insert into public.calendar_feeds (user_id, workspace_id, token)
  values (auth.uid(), p_workspace_id, v_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now();

  return v_token;
end;
$$;

-- Se repiten los grants: `create or replace` conserva los privilegios
-- existentes, pero dejarlos explícitos evita que una futura recreación los
-- pierda en silencio — el patrón que ya costó dos regresiones en este
-- proyecto (ver la nota del README sobre funciones security definer).
revoke execute on function public.get_or_create_calendar_feed(uuid) from public, anon;
revoke execute on function public.regenerate_calendar_feed(uuid) from public, anon;
grant execute on function public.get_or_create_calendar_feed(uuid) to authenticated;
grant execute on function public.regenerate_calendar_feed(uuid) to authenticated;
