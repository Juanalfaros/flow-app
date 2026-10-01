-- 0051_push_dispatch_webhook.sql — Database Webhook: notifications INSERT -> Worker
--
-- Equivalente en SQL de lo que crea el dashboard de Supabase (Database >
-- Webhooks) al elegir tabla `notifications`, evento Insert, HTTP Request
-- POST a .../api/push/dispatch. Se escribe acá como migración versionada
-- en vez de click-ops en el dashboard, mismo criterio que el resto del
-- esquema — no depende de que alguien recuerde reproducir el paso a mano
-- en un proyecto nuevo.
--
-- `pg_net` (async, no bloquea el commit del INSERT) y `supabase_vault` ya
-- estaban disponibles/habilitados en este proyecto — ver
-- worker/push-dispatch.ts para el otro lado (`handlePushDispatch`).
--
-- El secreto compartido (X-Webhook-Secret) NO vive en esta migración: se
-- cargó una sola vez a mano vía `vault.create_secret(...)` (no queda en
-- git) y acá solo se referencia por NOMBRE
-- ('push_webhook_secret'). Rotarlo es un `vault.update_secret` suelto, sin
-- tocar el trigger.

create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'push_webhook_secret';

  -- Sin el secreto (vault no cargado todavía, p.ej. en un proyecto nuevo
  -- clonado de este repo) no tiene sentido ni siquiera intentar el POST:
  -- el Worker lo va a rechazar con 401 igual, así que se corta acá y se
  -- deja rastro en los logs de Postgres en vez de generar tráfico inútil.
  if webhook_secret is null then
    raise warning 'push: falta el secret "push_webhook_secret" en vault, notificación % no despachada', new.id;
    return new;
  end if;

  perform net.http_post(
    url := 'https://flow.zutra.cl/api/push/dispatch',
    body := jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', webhook_secret)
  );

  return new;
end;
$$;

create trigger push_notification_dispatch
  after insert on public.notifications
  for each row execute function public.dispatch_push_notification();

comment on function public.dispatch_push_notification() is
  'Web Push: llama a worker/push-dispatch.ts (handlePushDispatch) en cada notificación nueva. El cron de barrido (sweepPendingPushes) es la red de seguridad si esto falla. Ver README § Notificaciones push.';
