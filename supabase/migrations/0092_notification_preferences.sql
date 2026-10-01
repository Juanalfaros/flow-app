-- 0092_notification_preferences.sql — Matriz evento × canal, horario de
-- silencio y día/hora del resumen semanal.
--
-- Rediseño de Ajustes, PR 3 (mockup "Ajustes de Flow" v2,
-- https://claude.ai/artifact/1A1uLKy53WV5g5ELrxJZDz). Hasta acá "qué avisa"
-- eran dos booleanos sueltos en `profiles` (`notify_on_mention`,
-- `weekly_digest_enabled`, 0058_profile_preferences.sql) más el
-- todo-o-nada de `push_enabled` — ningún control decidía, por ejemplo,
-- "avísame por Push cuando me asignan algo, pero no por correo". Esta
-- migración agrega:
--
--   1. `notification_preferences`: una fila por (usuario, tipo de evento),
--      con un booleano por canal configurable. La Bandeja NO es una
--      columna acá — "La bandeja recibe todo siempre" es una decisión de
--      producto explícita en el mockup, no una casilla más; sigue
--      escribiéndose sin condición, igual que hoy (0016_notifications.sql).
--      Sin fila para un (usuario, evento) = default `push=true, email=
--      false` (ver el fallback en worker/push-dispatch.ts) — así ninguna
--      cuenta existente cambia de comportamiento hasta que alguien toque
--      la UI nueva.
--   2. Horario de silencio y día/hora del resumen: columnas nuevas en
--      `profiles`, mismo criterio que 0058/0090 (preferencias propias,
--      sin protección de `protect_profile_email`).
--
-- `event` reusa los mismos valores que `notifications.type`
-- (0016/0042/0043/0045/0064) para los 6 tipos que el mockup expone en la
-- matriz — deliberadamente NO incluye `watched_activity`,
-- `removed_from_workspace`, `role_changed` ni `welcome`: esos son casos de
-- borde institucionales (cambios de membresía) o ya viajan pegados a
-- `status_changed` desde la UI de la persona (ver comentario en
-- profile.tsx), no algo que alguien vaya a querer apagar por separado.

create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event text not null check (
    event in ('assigned', 'mention', 'comment', 'status_changed', 'unblocked', 'due_reminder')
  ),
  push boolean not null default true,
  email boolean not null default false,
  primary key (user_id, event)
);

alter table public.notification_preferences enable row level security;

create policy "own_notification_preferences_select" on public.notification_preferences
  for select using (user_id = (select auth.uid()));

create policy "own_notification_preferences_insert" on public.notification_preferences
  for insert with check (user_id = (select auth.uid()));

create policy "own_notification_preferences_update" on public.notification_preferences
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own_notification_preferences_delete" on public.notification_preferences
  for delete using (user_id = (select auth.uid()));

comment on table public.notification_preferences is
  'Matriz evento × canal de Ajustes → Notificaciones. Sin fila = default push=true, email=false (ver worker/push-dispatch.ts). La Bandeja no está acá: recibe todo siempre, sin excepción.';

-- Horario de silencio: solo pausa Push (la Bandeja no cambia, igual que el
-- resto de esta migración) — el aviso queda pendiente (`pushed_at` sin
-- setear) y lo entrega el barrido de red de seguridad ya existente
-- (`sweepPendingPushes`, worker/push-dispatch.ts) apenas termina la
-- ventana, sin necesidad de una cola nueva.
--
-- Día/hora del resumen: reemplaza el `DIGEST_DAY_OF_WEEK` fijo que tenía
-- worker/digest-dispatch.ts. `digest_hour` en la hora LOCAL de la persona
-- (columna `timezone`, ya existente) — worker/digest-dispatch.ts hace la
-- conversión con `Intl.DateTimeFormat` en vez de guardar un offset acá.
alter table public.profiles
  add column quiet_hours_enabled boolean not null default false,
  add column quiet_hours_start smallint not null default 20 check (quiet_hours_start between 0 and 23),
  add column quiet_hours_end smallint not null default 8 check (quiet_hours_end between 0 and 23),
  add column quiet_weekends boolean not null default false,
  add column digest_day smallint not null default 1 check (digest_day between 0 and 6),
  add column digest_hour smallint not null default 9 check (digest_hour between 0 and 23);

comment on column public.profiles.quiet_hours_enabled is
  'Silencia solo Push entre quiet_hours_start y quiet_hours_end (hora local, columna timezone). La Bandeja no cambia.';
comment on column public.profiles.digest_day is
  '0=domingo..6=sábado (mismo criterio que week_starts_on) — día local del resumen semanal.';
comment on column public.profiles.digest_hour is
  'Hora local (0-23) del resumen semanal. Ver localWeekdayAndHour en worker/local-time.ts.';

-- Marca una notificación retenida por horario de silencio: `pushed_at`
-- queda sin setear (no se dio por entregada) pero se exime del corte de
-- "muy vieja, se abandona" que aplica sweepPendingPushes (worker/
-- push-dispatch.ts) al resto del backlog — si no, una ventana de silencio
-- de más de SWEEP_MAX_AGE_MINUTES (hoy 60) perdería el aviso en silencio
-- en vez de entregarlo al terminar la ventana.
alter table public.notifications add column push_quiet_hold boolean not null default false;

comment on column public.notifications.push_quiet_hold is
  'true mientras un horario de silencio (profiles.quiet_hours_*) retiene el Push. sweepPendingPushes la reintenta cada minuto sin importar su edad hasta que la ventana termine. La Bandeja no la usa: ya se creó igual, sin condición.';

-- `notify_on_mention` (0058/0059) era un interruptor previo al insert: en
-- false, ni siquiera se creaba la fila en `notifications` — la única
-- excepción a "la Bandeja recibe todo siempre" que tiene el resto del
-- sistema (ningún otro trigger de notify_from_* la condiciona). El mockup
-- de esta pestaña deja ese principio explícito, así que se revierte acá:
-- `notify_from_mention()` vuelve a insertar sin condición (como en
-- 0016_notifications.sql, antes de 0059) y el control fino pasa a vivir
-- en `notification_preferences` (push/email por evento, arriba), que sí
-- se evalúa en worker/push-dispatch.ts sin tocar la Bandeja.
create or replace function public.notify_from_mention()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_node_id uuid;
  v_author_id uuid;
begin
  select c.node_id, n.workspace_id, c.author_id into v_node_id, v_workspace_id, v_author_id
  from public.comments c join public.nodes n on n.id = c.node_id
  where c.id = new.comment_id;

  if new.mentioned_user_id != v_author_id then
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (v_workspace_id, new.mentioned_user_id, v_author_id, v_node_id, 'mention', jsonb_build_object('comment_id', new.comment_id));
  end if;
  return new;
end;
$$;

alter table public.profiles drop column notify_on_mention;
