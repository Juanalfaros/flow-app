-- 0050_push_subscriptions.sql — Web Push (notificaciones del sistema
-- operativo) sobre las `notifications` que ya generan 0042/0043.
--
-- Hasta ahora las notificaciones solo existían dentro de la app: la
-- campana del topbar y /bandeja, alimentadas por un canal de Realtime que
-- únicamente vive mientras la pestaña está abierta y en primer plano. En
-- un teléfono con la PWA cerrada no llegaba nada.
--
-- Este esquema agrega las dos piezas que faltaban:
--   1. `push_subscriptions` — a qué endpoints hay que empujar por usuario.
--      Un usuario tiene una fila por navegador/dispositivo.
--   2. `notifications.pushed_at` — marca de entregado, que hace el envío
--      idempotente y habilita el barrido del cron (ver worker/push-*.ts).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- El endpoint ES la identidad de la suscripción: el navegador puede
  -- renovarla y devolver el mismo endpoint, así que `unique` + upsert
  -- evita duplicados sin necesidad de limpiar antes.
  endpoint text not null unique,
  -- Claves del navegador para el cifrado RFC 8291. Se guardan en
  -- base64url tal como las entrega `PushSubscription.toJSON()`.
  p256dh text not null,
  auth text not null,
  -- Solo para que la persona reconozca cuál es cuál en la lista de
  -- dispositivos de su perfil ("Chrome en Android"). No se parsea.
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  -- Se limpia a 0 en cada envío exitoso. Ver la nota de más abajo sobre
  -- por qué no hay borrado automático por umbral.
  failure_count int not null default 0
);

create index idx_push_subscriptions_user_id on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Cada quien administra solo sus propias suscripciones. El Worker las lee
-- con la service role key, que saltea RLS — no hace falta (ni conviene)
-- una policy de lectura para otros usuarios.
create policy "own_push_subscriptions_select" on public.push_subscriptions
  for select using (user_id = (select auth.uid()));

create policy "own_push_subscriptions_insert" on public.push_subscriptions
  for insert with check (user_id = (select auth.uid()));

create policy "own_push_subscriptions_update" on public.push_subscriptions
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own_push_subscriptions_delete" on public.push_subscriptions
  for delete using (user_id = (select auth.uid()));

-- Preferencia por usuario. Vive en `profiles` y no en una tabla nueva
-- porque es un solo booleano y `profiles` ya se lee en cada arranque.
-- Default true: quien se tomó el trabajo de conceder el permiso del
-- navegador ya dijo que sí; un segundo opt-in sería redundante.
alter table public.profiles
  add column push_enabled boolean not null default true;

-- `pushed_at` cumple dos funciones a la vez:
--   - idempotencia: el webhook y el barrido del cron pueden procesar la
--     misma fila (webhook lento + cron que pasa mientras tanto), y el
--     `is null` del filtro evita el envío doble.
--   - reintento: una fila que quedó sin marcar es, por definición, una
--     que no se entregó, así que el barrido la vuelve a tomar sin
--     necesidad de una cola aparte.
alter table public.notifications
  add column pushed_at timestamptz;

-- Índice parcial: el barrido pregunta siempre por lo NO enviado, que en
-- régimen es un puñado de filas sobre una tabla que solo crece. El
-- predicado mantiene el índice del tamaño del backlog, no del histórico.
create index idx_notifications_unpushed
  on public.notifications (created_at)
  where pushed_at is null;

comment on table public.push_subscriptions is
  'Endpoints de Web Push por usuario y dispositivo. Las escribe el cliente vía RLS; las lee el Worker con service role.';
comment on column public.notifications.pushed_at is
  'Marca de entrega de Web Push. NULL = pendiente, y el barrido del cron la reintentará.';

-- Nota deliberada sobre el borrado de suscripciones muertas: NO se borran
-- por `failure_count`. La única señal confiable de que un endpoint murió
-- es un 404/410 del propio push service (RFC 8030 §7.3), y eso lo maneja
-- el Worker borrando la fila en el momento. Un 500 o un timeout de FCM
-- son transitorios: usarlos para desuscribir dejaría a la persona sin
-- notificaciones por una caída ajena, y sin forma de enterarse.
-- `failure_count` queda como dato de diagnóstico, no como disparador.
