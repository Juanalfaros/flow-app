-- 0022_closed_signup.sql — registro cerrado: solo el primer usuario (quien
-- monta el workspace) puede crear su cuenta libremente; de ahí en adelante se
-- entra únicamente por invitación.
--
-- ============================================================
-- Por qué en la base y no con `disable_signup` de GoTrue
-- ============================================================
-- El flag `disable_signup` del dashboard apagaría el registro para todos,
-- incluido el primer usuario — habría que dejarlo abierto, crear la cuenta y
-- acordarse de cerrarlo a mano, con la ventana abierta mientras tanto. Un
-- trigger sobre `auth.users` no tiene ese problema: la regla "el primero pasa,
-- el resto necesita invitación" se evalúa sola en cada alta.
--
-- Además cubre TODAS las puertas de entrada a la vez. `auth.users` es el
-- cuello de botella por el que pasan por igual:
--   * signUp con email+contraseña,
--   * signInWithOtp / magic link (crea usuario si no existe),
--   * los proveedores OAuth que se habiliten en el futuro,
--   * y `auth.admin.inviteUserByEmail` desde el Worker.
-- Cerrar solo el formulario del cliente habría dejado abiertas las otras.

-- ============================================================
-- 1. ¿Hay que mostrar el formulario de registro?
-- ============================================================
-- La usa el login para decidir si ofrece "Crear una cuenta" o si explica que
-- el acceso es por invitación. Se expone a `anon` porque hace falta ANTES de
-- tener sesión; lo único que revela es si la instancia ya fue inicializada,
-- que es justamente lo que la pantalla necesita comunicar.
create or replace function public.is_signup_open()
returns boolean
language sql security definer stable set search_path = public
as $$
  select not exists (select 1 from auth.users);
$$;

revoke execute on function public.is_signup_open() from public;
grant execute on function public.is_signup_open() to anon, authenticated;

-- ============================================================
-- 2. La regla, aplicada en el alta
-- ============================================================
-- Orden de los casos, de más permisivo a menos:
--   a) No hay ningún usuario todavía -> es el fundador, pasa. Este es el
--      único momento en que el registro está abierto en toda la vida del
--      proyecto.
--   b) Hay una invitación pendiente y vigente para ese correo -> pasa. Cubre
--      tanto a `inviteUserByEmail` (el Worker inserta la invitación vía
--      `invite_member` ANTES de llamar al admin API, ver worker/invite.ts)
--      como a quien se registre por su cuenta con un correo ya invitado.
--   c) Cualquier otro caso -> se rechaza.
--
-- Es BEFORE INSERT, así que en (a) `auth.users` todavía no contiene la fila
-- nueva y el `not exists` da true exactamente para el primer usuario.
create or replace function public.enforce_signup_policy()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from auth.users) then
    return new;
  end if;

  if exists (
    select 1 from public.invitations
    where lower(email) = lower(new.email)
      and status = 'pending'
      and expires_at > now()
  ) then
    return new;
  end if;

  raise exception 'El registro está cerrado. Necesitas una invitación para entrar.'
    using errcode = '42501';
end;
$$;

create trigger on_auth_user_signup_policy
  before insert on auth.users
  for each row execute function public.enforce_signup_policy();

-- ============================================================
-- Nota operativa: cómo se recupera si el fundador queda a medias
-- ============================================================
-- El portón se cierra al crear la PRIMERA cuenta, no al crear el primer
-- workspace. Si esa cuenta se abandona antes de completar el onboarding,
-- nadie más puede registrarse y tampoco hay workspace desde el cual invitar.
-- La salida es borrar ese usuario (Dashboard > Authentication > Users), que
-- deja `auth.users` vacío y vuelve a abrir el registro.
--
-- Se prefirió atar la regla a "existe un usuario" y no a "existe un
-- workspace" porque la segunda deja una ventana abierta: entre el alta del
-- fundador y la creación de su workspace, cualquiera podría registrarse.
