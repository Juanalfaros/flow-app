-- 0018_email_identity.sql — cierra la escalada de privilegios que encadenaba
-- `profiles.email` (escribible por el propio usuario) con
-- `accept_pending_invitations` (que decidía membresías leyendo esa columna).
--
-- La cadena del ataque, con las policies de 0001/0004:
--   1. `profiles_update_own` es `for update using (auth.uid() = id)` sin
--      restricción de columnas -> el usuario puede escribir su propio
--      `profiles.email` con CUALQUIER valor. Postgres reusa el USING como
--      WITH CHECK, así que solo garantiza que no cambie el `id`.
--   2. `accept_pending_invitations()` resolvía a quién darle membresía con
--      `select email into v_email from public.profiles where id = auth.uid()`.
--   3. Entonces: `update profiles set email='victima@empresa.com'` + llamar a
--      la RPC = membresía en el workspace ajeno, con el rol que diga la
--      invitación (incluido 'admin'). El email invitado es adivinable cuando
--      la empresa usa un dominio conocido.
--
-- Dos defensas independientes, porque cada una cubre un hueco que la otra no:
-- (A) la RPC deja de confiar en una columna escribible por el cliente, y
-- (B) esa columna deja de ser escribible por el cliente.

-- ============================================================
-- 1. (A) accept_pending_invitations usa la identidad verificada
-- ============================================================
-- `auth.users` es la fuente de verdad del email (la escribe GoTrue, no el
-- cliente) y es legible desde acá porque la función es security definer.
-- Se exige además `email_confirmed_at is not null`: un signup con el email de
-- otra persona que nunca se confirmó no debe poder consumir invitaciones —
-- si no, (B) sola no alcanzaría, bastaría registrarse con el email de la
-- víctima y no confirmarlo jamás.
--
-- `lower()` en ambos lados de la comparación: `invite_member` ya normaliza a
-- minúsculas al insertar, pero las filas previas a esa RPC (o insertadas a
-- mano) pueden no estarlo.
create or replace function public.accept_pending_invitations()
returns void
language plpgsql security definer set search_path = public
as $$
declare v_email text;
begin
  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;

  if v_email is null then return; end if;

  insert into public.memberships (workspace_id, user_id, role)
  select i.workspace_id, auth.uid(), i.role
  from public.invitations i
  where lower(i.email) = v_email and i.status = 'pending' and i.expires_at > now()
  on conflict (workspace_id, user_id) do nothing;

  update public.invitations set status = 'accepted'
  where lower(email) = v_email and status = 'pending' and expires_at > now();
end;
$$;

-- ============================================================
-- 2. (B) profiles.email pasa a ser copia derivada, no editable
-- ============================================================
-- Se revierte en silencio en vez de lanzar excepción: `updateProfile` y
-- `uploadAvatar` (src/features/profile/api.ts) mandan updates parciales y
-- PostgREST omite las columnas ausentes, así que nada del cliente actual
-- intenta escribir el email — un raise solo rompería flujos legítimos
-- futuros que hicieran un update más ancho.
--
-- El guard se aplica solo cuando hay un usuario JWT en contexto. `auth.uid()`
-- es null cuando el UPDATE viene del trigger de `auth.users` del punto 3
-- (GoTrue usa su propia conexión, sin claims de PostgREST) o de una tarea de
-- mantenimiento con service_role sin sesión — esos casos sí deben poder
-- escribir, y son justamente los que mantienen la columna sincronizada.
create or replace function public.protect_profile_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.email := old.email;
  end if;
  return new;
end;
$$;

create trigger trg_protect_profile_email
  before update on public.profiles
  for each row execute function public.protect_profile_email();

-- ============================================================
-- 3. Sincronizar profiles.email desde auth.users
-- ============================================================
-- Sin esto, el punto 2 congelaría la columna para siempre.
-- `handle_new_user` (0001_init.sql) solo la seedea en el INSERT del signup,
-- así que hoy queda desactualizada apenas el usuario completa el flujo de
-- "secure email change" de Supabase — deuda ya documentada en el comentario
-- de `updateEmail` (src/features/profile/api.ts) que este trigger salda.
-- Mismo patrón y precedente que `on_auth_user_created` (0001): trigger sobre
-- auth.users, security definer.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- Backfill de las filas que ya divergieron antes de existir el trigger.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

-- ============================================================
-- 4. get_invitation_preview: eliminar la superficie anónima
-- ============================================================
-- Estaba `grant`eada a `anon` y devolvía el email del invitado y el nombre
-- del workspace a cualquiera con el token, sin chequear status ni expiración.
-- Ningún cliente la llama: src/routes/accept-invite.tsx no lee ningún token
-- (el flujo real es inviteUserByEmail + accept_pending_invitations), y la
-- función solo aparece en types/database.ts, que es generado. Se elimina en
-- vez de endurecerse — superficie anónima sin consumidor.
drop function if exists public.get_invitation_preview(uuid);
