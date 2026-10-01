-- 0058_profile_preferences.sql — Preferencias reales del Perfil.
--
-- `PreferencesSection` (src/routes/_app/profile.tsx) mostraba 6 selects +
-- 2 checkboxes sin ningún estado detrás — puro mock para que el formulario
-- se sintiera interactivo. Esta migración agrega las columnas que le faltan
-- a `profiles` para que cada control persista de verdad. `timezone` ya
-- existe desde 0024_profile_org_fields.sql y se reusa tal cual.
--
-- No se agrega columna de idioma: la app entera está en español, cada
-- string vive escrito a mano en los componentes — un selector que no
-- traduce nada sería peor que no tenerlo (decisión del usuario).
--
-- Sin RLS nueva: `profiles_update_own` (0001_init.sql) ya cubre cualquier
-- columna nueva, y `protect_profile_email` (0024) no las toca — solo
-- congela `email`/`last_seen_at`/`manager_id`.

alter table public.profiles
  add column theme text not null default 'system'
    check (theme in ('light', 'dark', 'system')),
  add column default_view text not null default 'list'
    check (default_view in ('list', 'board', 'calendar', 'table')),
  -- 0 = domingo, 1 = lunes (mismo criterio que `weekStartsOn` de date-fns).
  add column week_starts_on smallint not null default 1
    check (week_starts_on in (0, 1)),
  add column date_format text not null default 'dd/MM/yyyy'
    check (date_format in ('dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd')),
  add column accent_color text not null default '#28BDB0',
  -- Distinto de `push_enabled` (0050): ese es el interruptor global de Web
  -- Push, este filtra puntualmente las notificaciones de mención.
  add column notify_on_mention boolean not null default true,
  add column weekly_digest_enabled boolean not null default false,
  -- Idempotencia del envío del resumen semanal (Fase 5) — mismo criterio
  -- que `notifications.pushed_at` (0050): NULL/fecha vieja = pendiente.
  add column last_digest_sent_at date;

comment on column public.profiles.theme is
  'Tema de la interfaz elegido por la persona. Sincronizado con next-themes en el cliente (ver useSyncProfilePreferences).';
comment on column public.profiles.default_view is
  'Vista que se abre por defecto al entrar a un proyecto sin vista explícita en la URL.';
comment on column public.profiles.weekly_digest_enabled is
  'Opt-in al resumen semanal por correo (worker/digest-dispatch.ts). Independiente de push_enabled.';
