-- 0077_workspace_branding.sql — logo propio sobre el formulario de login y
-- una imagen de fondo para el panel izquierdo (hoy el bloque sólido en
-- `--accent`). Pedido explícito del usuario (2026-09-11), junto con sacar
-- el bloque "Plan / Free" de Mi perfil — esto es una app interna, sin
-- planes de ningún tipo.
--
-- App de hecho single-tenant (registro cerrado, 0022_closed_signup.sql):
-- "el" workspace para efectos de branding es el primero por `created_at`,
-- mismo criterio que ya usa `useCurrentWorkspace` en el cliente
-- (`memberships[0]`, ordenado igual).

-- ============================================================
-- 1. Dos columnas nuevas, ambas opcionales.
-- ============================================================
alter table public.workspaces add column logo_url text;
alter table public.workspaces add column login_background_url text;
-- Sin cambio de RLS para el UPDATE: `workspaces_update_admin` (0003_rls.sql)
-- ya cubre estas dos columnas igual que el resto de la fila.

-- ============================================================
-- 2. get_login_branding — la pantalla de login corre SIN sesión (`anon`).
--    `workspaces_select` (0003) exige `is_member_of`, así que no hay forma
--    de leer estos dos campos desde ahí sin esta función — mismo criterio
--    y misma forma que `is_signup_open` (0022): security definer, expuesta
--    a `anon`, y no devuelve nada más de la fila que esto.
-- ============================================================
create or replace function public.get_login_branding()
returns table (logo_url text, login_background_url text)
language sql security definer stable set search_path = public
as $$
  select logo_url, login_background_url from public.workspaces order by created_at asc limit 1;
$$;

revoke execute on function public.get_login_branding() from public;
grant execute on function public.get_login_branding() to anon, authenticated;

-- ============================================================
-- 3. Bucket de storage — mismo molde que `avatars` (0010): público para
--    lectura (la pantalla de login lo pinta con un <img>/CSS
--    background-image sin sesión), escritura solo para quien administra
--    ESE workspace. Carpeta = workspace_id, no user_id: es branding del
--    workspace, no de una persona.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

create policy "branding_public_read" on storage.objects
  for select using (bucket_id = 'branding');

-- El cast a uuid puede lanzar sobre un path malformado — eso aborta el
-- insert/update con error en vez de simplemente negarlo, pero el efecto de
-- seguridad es el mismo (falla cerrado): solo el propio cliente arma estos
-- paths (features/workspace/api.ts), nunca a partir de input arbitrario.
create policy "branding_admin_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and public.is_admin_of(((storage.foldername(name))[1])::uuid)
  );

create policy "branding_admin_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding'
    and public.is_admin_of(((storage.foldername(name))[1])::uuid)
  );

create policy "branding_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding'
    and public.is_admin_of(((storage.foldername(name))[1])::uuid)
  );
