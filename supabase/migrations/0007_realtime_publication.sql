-- 0007_realtime_publication.sql — habilita Postgres Changes (Realtime)
-- para tasks. Ver plan F3 M2. comments/task_labels/statuses quedan
-- fuera a propósito: no tienen project_id propio para filtrar barato,
-- y el único requisito duro de aceptación de F3 es sincronizar tareas.
alter publication supabase_realtime add table public.tasks;
