-- 0009_nodes_cleanup.sql — punto de no retorno. Solo aplicar después de
-- verificar 0008 a mano (ver checklist en PLAN.md / plan de implementación).
-- Dropea spaces/projects/tasks (NO workspaces/statuses/memberships/profiles).

-- Realtime: publicar nodes + node_memberships, quitar tasks. Tiene que ir
-- ANTES de `drop table public.tasks` — si se dropea la tabla primero,
-- `alter publication ... drop table public.tasks` ya no puede resolver el
-- nombre (la tabla no existe más) y falla. El `if exists` hace el paso
-- idempotente por si ya se corrió a mano (ALTER PUBLICATION no soporta
-- `drop table if exists`).
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    execute 'alter publication supabase_realtime drop table public.tasks';
  end if;
end $$;

alter publication supabase_realtime add table public.nodes;
alter publication supabase_realtime add table public.node_memberships;

drop trigger trg_set_task_workspace_id on public.tasks;
drop function public.set_task_workspace_id();
drop trigger trg_log_task_activity on public.tasks;
drop function public.log_task_activity();
drop trigger trg_tasks_updated_at on public.tasks;

drop table public.tasks;
drop table public.projects;
drop table public.spaces;
