-- 0072_task_completion_tracking.sql — `nodes.completed_at` (0015) hasta
-- acá solo lo llenaba `useToggleTaskDoneMutation` a mano, y solo para
-- tareas personales (sin proyecto, sin status_id). Cualquier tarea de
-- proyecto se "completa" cambiando `status_id` a un estado
-- `status_kind = 'success'` — y ESE camino nunca tocaba `completed_at`,
-- así que no había forma de saber CUÁNDO se completó una tarea de
-- proyecto, solo que estaba completa (vía el join a `statuses`).
--
-- Sin esa fecha, el detalle de tarea no puede distinguir "vencida, sigue
-- abierta" (alarma real) de "se entregó tarde, ya está resuelta" (dato
-- histórico, no una alarma) — hoy ambas se ven igual: rojo, "Venció hace
-- N días", incluso con la tarea marcada Hecha. Reportado por el usuario.
--
-- Trigger nuevo, no un `update` puntual: cualquier cambio de status_id
-- (Select del detalle, board, list, bulk actions, automatizaciones)
-- pasa por acá igual, sin tener que enseñarle esto a cada call site —
-- mismo criterio que ya usa set_updated_at (0001) para su propio campo.
create or replace function public.set_task_completed_at()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_new_kind text;
  v_old_kind text;
begin
  if new.type != 'task' or new.status_id is not distinct from old.status_id then
    return new;
  end if;

  select status_kind into v_new_kind from public.statuses where id = new.status_id;
  select status_kind into v_old_kind from public.statuses where id = old.status_id;

  if v_new_kind = 'success' and v_old_kind is distinct from 'success' then
    new.completed_at := now();
  elsif v_new_kind is distinct from 'success' and v_old_kind = 'success' then
    -- Se reabrió (o se movió a un estado que ya no es "success"): ya no
    -- hay una fecha de entrega real que mostrar.
    new.completed_at := null;
  end if;

  return new;
end;
$$;

-- BEFORE, no AFTER: tiene que dejar `completed_at` resuelto en NEW antes
-- de que corran trg_log_node_activity/trg_status_change_automations
-- (ambos AFTER UPDATE sobre nodes), para que cualquiera de los dos que
-- lo necesite en el futuro ya lo vea escrito, sin depender del orden
-- alfabético entre triggers.
create trigger trg_set_task_completed_at
  before update of status_id on public.nodes
  for each row execute function public.set_task_completed_at();

-- Backfill deliberadamente NO incluido: no hay forma confiable de saber
-- CUÁNDO se completó una tarea ya completada hoy (activity_log tiene el
-- historial, pero reconstruirlo para todas las tareas existentes es un
-- costo aparte que no bloquea esta migración) — quedan sin
-- `completed_at` hasta que se reabran y vuelvan a completarse. El
-- cliente ya contempla este caso: sin `completed_at`, no afirma "a
-- tiempo" ni "tarde", solo dice "Hecha" sin más.
