-- 0057_notification_email_fallback.sql — F5 #10, la de menor prioridad de
-- todo el plan: marca de entrega para el fallback de email
-- (worker/email-dispatch.ts), mismo criterio que `pushed_at` (0050).
--
-- No es una segunda marca de idempotencia independiente: el fallback solo
-- se intenta desde la misma rama de deliverNotification() que ya termina
-- marcando `pushed_at` (0 dispositivos con push suscrito) — `emailed_at`
-- es informativo (para saber por qué canal llegó, si llegó), no algo que
-- ninguna otra consulta filtre.

alter table public.notifications add column emailed_at timestamptz;

comment on column public.notifications.emailed_at is
  'Marca de entrega por email (fallback de Web Push, F5 #10). NULL = no se intentó o falló — no se reintenta por separado, ver worker/email-dispatch.ts.';
