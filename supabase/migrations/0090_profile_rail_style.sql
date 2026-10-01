-- 0090_profile_rail_style.sql — Fondo del riel de navegación, por cuenta.
--
-- El riel y el panel del sidebar son `.dark-scope`: grafito en los dos
-- temas. Esta columna deja elegir si ese grafito se tiñe con el color de
-- acento de la cuenta (`accent_color`, 0058_profile_preferences.sql), que
-- es la pieza que faltaba para que el acento se note en la navegación y no
-- solo en el contenido.
--
-- Tres modos, no un booleano: "un poco" y "del todo" se ven muy distinto y
-- la decisión no es binaria.
--   grafito — #151515 de siempre. El default: nadie se entera de que esto
--             existe hasta que lo busca.
--   tinte   — el mismo grafito con un 12% del acento. Se nota que hay un
--             color sin que el riel compita con el contenido.
--   solido  — #0C0C0C con un 30% del acento. El riel pasa a ser una pieza
--             de marca.
-- Las mezclas exactas viven en `deriveRailPalette` (src/lib/color.ts); acá
-- solo se guarda cuál de los tres se eligió.
--
-- `not null default 'grafito'`: las filas existentes quedan exactamente
-- como se ven hoy, sin migración de datos ni backfill.
--
-- Sin RLS nueva: `profiles_update_own` (0001_init.sql) ya cubre cualquier
-- columna nueva de `profiles`, y `protect_profile_email` (0024) no la toca
-- — solo congela `email`/`last_seen_at`/`manager_id`. Mismo razonamiento
-- que 0058, que agregó `accent_color` al lado.

alter table public.profiles
  add column rail_style text not null default 'grafito'
    check (rail_style in ('grafito', 'tinte', 'solido'));

comment on column public.profiles.rail_style is
  'Fondo del riel del sidebar: grafito (default), tinte (12% del acento) o solido (30%). Ver deriveRailPalette en src/lib/color.ts.';
