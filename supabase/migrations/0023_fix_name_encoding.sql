-- 0023_fix_name_encoding.sql — reescribe los nombres que quedaron con la
-- codificación destruida.
--
-- ============================================================
-- Qué pasó
-- ============================================================
-- Los usuarios se cargaron desde una sesión de CLI en Windows, pasando el
-- texto por el shell. La consola no está en UTF-8 (usa la codepage ANSI del
-- sistema, cp1252 en español), así que cada carácter acentuado se perdió en
-- el camino y llegó a la base como U+FFFD (`�`, el carácter de reemplazo):
--
--     Nombre Uno  ->  Catalina Echeverr�a
--     Nombre Cuatro     ->  Maria Jos� Palma
--
-- U+FFFD no conserva nada del carácter original —es literalmente "acá había
-- algo que no supe decodificar"—, así que no hay forma de revertirlo: los
-- nombres se reescriben a mano.
--
-- Se corrigen también los que NO muestran `�` (Guzmán, María): esos llegaron
-- sin tilde desde el origen, no rotos, pero el nombre correcto la lleva.
--
-- Para que no vuelva a pasar: cargar este tipo de datos desde un archivo
-- .sql en UTF-8 (como este) y aplicarlo con `supabase db push`, nunca
-- pasando el texto como argumento por la consola de Windows.

-- ============================================================
-- 1. auth.users — el `full_name` que muestra el dashboard
-- ============================================================
-- Se matchea por email (ASCII puro, no afectado por el problema). `coalesce`
-- por si algún usuario no tiene metadata todavía: `jsonb_set` sobre NULL
-- devuelve NULL y borraría el resto del objeto.
update auth.users u
set raw_user_meta_data =
  jsonb_set(coalesce(u.raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb(n.full_name))
from (values
  ('usuario1@example.com', 'Nombre Uno'),
  ('usuario2@example.com',     'Nombre Dos'),
  ('usuario3@example.com',    'Nombre Tres'),
  ('usuario4@example.com',      'Nombre Cuatro')
) as n(email, full_name)
where lower(u.email) = n.email;

-- ============================================================
-- 2. public.profiles — lo que ve la app
-- ============================================================
-- `handle_new_user` (0001_init.sql) copió el nombre roto acá en el alta, así
-- que aparece igual en avatares, asignados de tarea y comentarios. Se matchea
-- por `id` contra auth.users en vez de por `profiles.email`, que es una copia
-- desnormalizada y podría estar desactualizada.
update public.profiles p
set full_name = n.full_name
from auth.users u
join (values
  ('usuario1@example.com', 'Nombre Uno'),
  ('usuario2@example.com',     'Nombre Dos'),
  ('usuario3@example.com',    'Nombre Tres'),
  ('usuario4@example.com',      'Nombre Cuatro')
) as n(email, full_name) on lower(u.email) = n.email
where p.id = u.id;
