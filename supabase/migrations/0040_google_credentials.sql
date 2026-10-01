-- 0040_google_credentials.sql — credenciales de Google Calendar por persona.
--
-- ============================================================
-- Por qué esta tabla es distinta a todas las demás
-- ============================================================
-- Un refresh token de Google no es una sesión que expira: es acceso continuo
-- al calendario de esa persona hasta que lo revoque. Si esta tabla se filtra,
-- el atacante no obtiene datos de Flow — obtiene la agenda de todo el
-- equipo, en Google, indefinidamente.
--
-- Por eso el token NO se guarda en claro ni cifrado por la base:
--
--   * Se cifra en el Worker con AES-GCM (ver worker/google.ts) antes de
--     llegar acá. Postgres solo ve un blob en base64.
--   * La clave vive como secret del Worker (`GOOGLE_TOKEN_KEY`), fuera de la
--     base. Un dump completo de Postgres no alcanza para descifrar nada.
--   * Ni siquiera los administradores del workspace pueden leer el token
--     ajeno: la policy es por `user_id = auth.uid()`, sin la excepción de
--     admin que sí tienen `time_off`, `teams` o `node_access`.
--
-- Ese último punto es deliberado y distinto al resto del esquema. En todo lo
-- demás, un admin necesita ver los datos del equipo para administrarlos; acá
-- no hay nada que administrar sobre una credencial personal de un servicio
-- externo, y el daño de exponerla no lo contiene el workspace.

create table public.google_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- La cuenta de Google que autorizó, para poder mostrar "conectado como X"
  -- sin descifrar nada. No es secreta.
  google_email text not null,
  -- AES-GCM en base64: `iv.ciphertext`. Ver `encryptToken` en worker/google.ts.
  refresh_token_encrypted text not null,
  -- Los scopes concedidos. Sirven para detectar que Google otorgó menos de lo
  -- pedido (el usuario puede desmarcar permisos en la pantalla de consentimiento)
  -- y avisar en vez de fallar después con un 403 opaco.
  scope text not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create index idx_google_credentials_workspace on public.google_credentials(workspace_id);

alter table public.google_credentials enable row level security;

-- Solo la propia fila. Sin excepción para admin, a diferencia del resto del
-- esquema — ver la nota de arriba.
--
-- El ciphertext queda legible para su dueño, y no importa: sin la clave del
-- Worker no es descifrable. Aun así el cliente nunca lo selecciona (ver
-- features/google/queries.ts, que pide solo `google_email` y `connected_at`).
create policy "google_credentials_select_own" on public.google_credentials
  for select to authenticated using (user_id = auth.uid());

-- Desconectar sin depender del Worker: si el endpoint que revoca en Google
-- estuviera caído, la persona igual puede cortar el acceso de esta app. Queda
-- el permiso vivo del lado de Google, revocable desde su cuenta.
create policy "google_credentials_delete_own" on public.google_credentials
  for delete to authenticated using (user_id = auth.uid());

-- Sin policies de insert/update para `authenticated`: la fila la escribe solo
-- el Worker con `service_role`, que es el único que tiene el token en claro y
-- la clave para cifrarlo. Mismo criterio que `activity_log` (0001),
-- `notifications` (0016) y `presence_daily` (0027).

comment on column public.google_credentials.refresh_token_encrypted is
  'AES-GCM (iv.ciphertext, base64). La clave vive como secret del Worker, nunca en la base. Ver worker/google.ts.';
