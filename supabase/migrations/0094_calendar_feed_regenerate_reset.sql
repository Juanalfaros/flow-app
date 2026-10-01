-- 0094_calendar_feed_regenerate_reset.sql — regenerar el feed de calendario
-- también resetea `last_accessed_at`.
--
-- Encontrado al sumar "Google leyó el enlace por última vez" a Ajustes →
-- Integraciones (rediseño PR 5): `regenerate_calendar_feed` (0033) hacía
-- `on conflict (user_id) do update set token = excluded.token, created_at =
-- now()` sin tocar `last_accessed_at` — el token cambiaba pero la fecha de
-- última lectura quedaba la del token VIEJO, mostrando "leído hace 3 horas"
-- para un enlace que nadie leyó todavía. Mismo criterio que
-- `regenerate_public_link` (0085), que sí resetea ese campo al regenerar.
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
  on conflict (user_id) do update set token = excluded.token, created_at = now(), last_accessed_at = null;

  return v_token;
end;
$$;
