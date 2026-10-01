-- 0083_touch_is_assign.sql — D2 Fase 2: "Quién queda a cargo al crear"
-- (artifact "Dueños y cierres", regla A5 "Tocar es asignar" + A7 "avisar
-- a quien pidió"). D2 Fase 1 (0091 en el repo de PRs) resolvió A2
-- (asignación al CREAR, según el contexto); esta fase resuelve lo que
-- pasa cuando una tarea sin dueño se mueve DESPUÉS de creada.
--
-- A5: mover una tarea sin dueño a otro estado (o completarla, que
-- también es un cambio de estado) la asigna a quien hizo la acción, sin
-- preguntar. El schema no tiene un status_kind "en_progreso" propio
-- (ver status-kind.ts: "inprogress queda sin usar hasta que el schema
-- tenga una etapa propia") — así que "mover a en curso" se interpreta
-- como CUALQUIER cambio de status_id, no solo el que entra a 'success':
-- coincide con el nombre de la regla ("tocar es asignar", no "completar
-- es asignar") y es la única lectura que no inventa un mapeo que el
-- propio schema no sostiene.
--
-- Nunca pisa un responsable existente (`new.assignee_id is not null` →
-- no-op) ni actúa sin un actor real (`auth.uid() is null` → no-op, mismo
-- criterio que A3 "un default nunca apunta a un tercero": sin sesión no
-- hay a quién asignar).
--
-- Guard de profundidad (`pg_trigger_depth() > 1`): sin este guard, la
-- cascada de 0081/0082 (que cierra subtareas "checklist" sin
-- responsable ni fecha, moviéndolas a Hecho por dentro del propio
-- trigger) terminaría asignándolas a quien cerró el padre — exactamente
-- el ruido que D1 evita a propósito (esas subtareas nunca debieron tener
-- responsable). `pg_trigger_depth() = 1` es "este cambio de estado vino
-- directo de una sentencia del cliente/RPC", no "de otro trigger".
create or replace function public.assign_on_first_touch()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.type != 'task' then return new; end if;
  if old.status_id is not distinct from new.status_id then return new; end if;
  if new.assignee_id is not null then return new; end if;
  if auth.uid() is null then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;

  -- UPDATE explícito (no `new.assignee_id := auth.uid()` en un trigger
  -- BEFORE): así assignee_id queda mencionado en el target list de una
  -- sentencia real, que es lo que hace disparar
  -- trg_sync_assignee_id_to_task_assignees (`after ... of assignee_id`,
  -- 0041) y poblar task_assignees. Un BEFORE trigger mutando NEW no
  -- alcanza para eso.
  update public.nodes set assignee_id = auth.uid() where id = new.id;

  -- A7: quien pidió la tarea (created_by) se entera de que alguien la
  -- tomó — nunca si es la misma persona.
  if new.created_by is not null and new.created_by is distinct from auth.uid() then
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (
      new.workspace_id, new.created_by, auth.uid(), new.id, 'task_claimed',
      jsonb_build_object('task_title', new.title)
    );
  end if;

  return new;
end;
$$;

create trigger trg_assign_on_first_touch
  after update of status_id on public.nodes
  for each row execute function public.assign_on_first_touch();

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'assigned', 'status_changed', 'comment', 'mention', 'watched_activity',
    'unblocked', 'due_reminder', 'removed_from_workspace', 'role_changed', 'welcome',
    'subtask_resolved', 'task_claimed'
  ));
