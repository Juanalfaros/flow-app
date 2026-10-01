-- 0064_notifications_due_reminder_type.sql — agrega 'due_reminder' al
-- check de notifications.type (0016_notifications.sql) para que
-- worker/automation-dispatch.ts (Automatizaciones, 0063) pueda insertar
-- ese tipo de notificación.

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('assigned', 'status_changed', 'comment', 'mention', 'watched_activity', 'unblocked', 'due_reminder'));
