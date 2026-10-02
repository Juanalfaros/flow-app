-- 0096_accent_magenta_default.sql — el acento por defecto pasa de turquesa
-- (#28BDB0) a magenta (#FF0055).
--
-- `profiles.accent_color` manda sobre los valores por defecto del CSS: el hook
-- useSyncProfilePreferences escribe el color de la columna en :root, así que
-- cambiar solo index.css no alcanzaba — toda cuenta existente seguía viendo
-- turquesa porque la columna tenía '#28BDB0' guardado (0058).
--
-- Solo se migra a quien nunca tocó el color (sigue con el valor por defecto
-- anterior). Quien eligió otro acento —incluido el turquesa a propósito, no
-- se puede distinguir de "nunca lo tocó"— conserva lo que tiene salvo que
-- siga exactamente en '#28BDB0': ese caso es indistinguible y se cambia; la
-- persona puede volver a Turquesa desde Ajustes > Preferencias.
alter table public.profiles alter column accent_color set default '#FF0055';

update public.profiles set accent_color = '#FF0055' where accent_color = '#28BDB0';
