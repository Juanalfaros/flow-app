-- 0093_profile_preferences_v2.sql — Formato de hora y página de inicio.
--
-- Rediseño de Ajustes, PR 4 (mockup "Ajustes de Flow" v2). Dos columnas
-- nuevas en `profiles`, mismo criterio que 0058/0090/0092 (preferencia
-- propia, sin protección de `protect_profile_email`, sin RLS nueva:
-- `profiles_update_own` de 0001_init.sql ya alcanza).
--
-- `start_page` es un concepto DISTINTO de `default_view` (0058): ese es la
-- vista que se abre DENTRO de un proyecto sin vista explícita en la URL
-- (lista/tablero/calendario/tabla); `start_page` es a qué PÁGINA de nivel
-- superior te lleva Flow al entrar, antes de elegir ningún proyecto.

alter table public.profiles
  add column time_format text not null default '24h' check (time_format in ('24h', '12h')),
  add column start_page text not null default 'inicio' check (start_page in ('inicio', 'mis-tareas', 'bandeja'));

comment on column public.profiles.time_format is
  '24h (default) o 12h — formato de hora en toda la app.';
comment on column public.profiles.start_page is
  'Página que abre Flow al entrar: inicio (/), mis-tareas (/mis-tareas) o bandeja (/bandeja). Distinto de default_view (0058), que es la vista DENTRO de un proyecto.';
