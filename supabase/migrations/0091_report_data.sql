-- 0091_report_data.sql — rediseño de /reportes (mockup:
-- https://claude.ai/artifact/UtZT4mb5RAYrGzuYCqbNLU). Reemplaza las tres
-- queries client-side de reports/queries.ts (workloadByPerson,
-- overdueByProject, weeklyCompletions — cada una agregando hasta 2000 filas
-- EN EL NAVEGADOR) por una sola función de Postgres que hace toda la
-- agregación en el servidor.
--
-- `security invoker`, no `security definer` — a propósito, y es la primera
-- función de todo el repo que lo usa (todas las demás, desde
-- has_unmet_dependencies hasta create_project_with_defaults, son
-- `security definer` porque necesitan saltarse RLS para validar algo antes
-- de que la policy lo bloquee). Acá es al revés: esta función SOLO LEE, y
-- tiene que leer exactamente lo mismo que vería el usuario si hiciera las
-- consultas él mismo desde el cliente — la RLS de `nodes_access` (0035) debe
-- seguir aplicando fila por fila (un espacio privado sin acceso no debe
-- aportar ni un solo número al reporte). `security invoker` corre la
-- función con los permisos DE QUIEN LA LLAMA, así que ni falta ni sobra
-- ningún chequeo de membership propio: es exactamente el mismo filtro que
-- ya aplican `nodes_access`/`node_memberships_access`/etc. sobre cualquier
-- select directo.
--
-- Corrige de paso el primer "issue" del mockup: el reporte viejo contaba
-- "completada" con `updated_at` (comentario de reports/queries.ts, ya
-- obsoleto desde 0072_task_completion_tracking.sql, que llena
-- `nodes.completed_at` en CUALQUIER tarea que entra a un estado
-- `status_kind='success'`, no solo las personales). Esta función usa
-- `completed_at` en todos lados.
--
-- Aproximaciones documentadas en línea (sin tabla de historial de estados,
-- reconstruir "cuántas estaban abiertas hace una semana" con exactitud
-- requeriría leer `activity_log` evento por evento — de más para un delta
-- de reporte):
--   · delta de "abiertas": creadas en el período menos completadas/
--     descartadas en el período (movimiento neto del backlog).
--   · delta de "vencidas": vencidas ahora menos una reconstrucción con los
--     datos actuales de cuántas habrían estado vencidas al cierre del
--     período anterior (due_date pasado a esa fecha, y o bien sigue
--     abierta o se cerró después de esa fecha).

create or replace function public.get_report_data(
  p_workspace_id uuid,
  p_period text default 'semana',       -- 'semana' | 'mes' | 'trimestre'
  p_space_id uuid default null,
  p_team_id uuid default null,
  p_user_id uuid default null,
  p_include_subtasks boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
-- ============================================================
-- Ventana del período elegido y del período anterior (para deltas)
-- ============================================================
bounds as (
  select
    case p_period
      when 'mes' then date_trunc('month', current_date)::date
      when 'trimestre' then (date_trunc('week', current_date) - interval '11 weeks')::date
      else date_trunc('week', current_date)::date
    end as start_date,
    (current_date + 1)::date as end_date,
    case p_period
      when 'mes' then (date_trunc('month', current_date) - interval '1 month')::date
      when 'trimestre' then (date_trunc('week', current_date) - interval '23 weeks')::date
      else (date_trunc('week', current_date) - interval '1 week')::date
    end as prev_start_date,
    case p_period
      when 'mes' then date_trunc('month', current_date)::date
      when 'trimestre' then (date_trunc('week', current_date) - interval '11 weeks')::date
      else date_trunc('week', current_date)::date
    end as prev_end_date
),
-- ============================================================
-- Universo de tareas del reporte: raíz salvo "Subtareas: Sí", del
-- workspace, y filtradas por espacio/equipo/persona si se eligieron.
-- Todas las secciones de abajo parten de este mismo conjunto, así los
-- números "cuadran entre sí" (nota del propio mockup) en vez de que cada
-- bloque cuente con su propio criterio.
-- ============================================================
base_tasks as materialized (
  select
    n.id, n.title, n.priority, n.due_date, n.created_at, n.completed_at,
    n.is_milestone, n.space_id, n.parent_id,
    coalesce(s.status_kind, 'neutral') as status_kind,
    nm.container_id as project_id
  from public.nodes n
  left join public.statuses s on s.id = n.status_id
  left join public.node_memberships nm on nm.node_id = n.id
  where n.workspace_id = p_workspace_id
    and n.type = 'task'
    and (p_include_subtasks or n.parent_id is null)
    and (p_space_id is null or n.space_id = p_space_id)
    and (p_user_id is null or exists (
      select 1 from public.task_assignees ta where ta.node_id = n.id and ta.user_id = p_user_id
    ))
    and (p_team_id is null or exists (
      select 1 from public.task_assignees ta
      join public.team_members tm on tm.user_id = ta.user_id
      where ta.node_id = n.id and tm.team_id = p_team_id
    ))
),
open_tasks as (
  select * from base_tasks where status_kind not in ('success', 'dropped')
),
closed_with_due as (
  select * from base_tasks where status_kind = 'success' and due_date is not null
),

-- ============================================================
-- KPIs
-- ============================================================
kpi_open as (select count(*)::int as n from open_tasks),
kpi_open_prev_delta as (
  -- Movimiento neto del backlog en el período: cuánto entró menos cuánto
  -- salió (completada o descartada) — no hay snapshot histórico exacto de
  -- "cuántas estaban abiertas" en una fecha pasada.
  select
    (select count(*)::int from base_tasks, bounds where created_at >= bounds.start_date and created_at < bounds.end_date)
    - (select count(*)::int from base_tasks, bounds where completed_at is not null and completed_at >= bounds.start_date and completed_at < bounds.end_date)
    as n
),
kpi_done as (
  select count(*)::int as n from base_tasks, bounds
  where completed_at is not null and completed_at >= bounds.start_date and completed_at < bounds.end_date
),
kpi_done_prev as (
  select count(*)::int as n from base_tasks, bounds
  where completed_at is not null and completed_at >= bounds.prev_start_date and completed_at < bounds.prev_end_date
),
kpi_overdue as (
  select count(*)::int as n from open_tasks where due_date is not null and due_date < current_date
),
kpi_overdue_prev as (
  -- Reconstrucción con los datos de HOY: vencida a esa fecha si el
  -- vencimiento ya había pasado y, o sigue abierta, o se cerró después.
  select count(*)::int as n from base_tasks, bounds
  where due_date is not null and due_date < bounds.prev_end_date
    and (completed_at is null or completed_at >= bounds.prev_end_date)
    and status_kind not in ('dropped')
),
kpi_ontime as (
  select
    coalesce(round(100.0 * count(*) filter (where completed_at::date <= due_date) / nullif(count(*), 0))::int, 0) as pct
  from closed_with_due
),
kpi_cycle as (
  select
    coalesce(
      round(
        percentile_cont(0.5) within group (
          order by extract(epoch from (completed_at - created_at)) / 86400.0
        )::numeric, 1
      ), 0
    ) as days
  from base_tasks, bounds
  where completed_at is not null and completed_at >= bounds.start_date and completed_at < bounds.end_date
),
kpi_hours as (
  select coalesce(round(sum(te.minutes) / 60.0)::int, 0) as h
  from public.time_entries te
  join base_tasks bt on bt.id = te.node_id, bounds
  where te.entry_date >= bounds.start_date and te.entry_date < bounds.end_date
),
kpi_hours_prev as (
  select coalesce(round(sum(te.minutes) / 60.0)::int, 0) as h
  from public.time_entries te
  join base_tasks bt on bt.id = te.node_id, bounds
  where te.entry_date >= bounds.prev_start_date and te.entry_date < bounds.prev_end_date
),

-- ============================================================
-- Creadas y completadas por semana: 12 semanas fijas, independiente del
-- período elegido (mismo criterio que el mockup — el selector de período
-- solo mueve los KPIs de arriba, no esta tendencia).
-- ============================================================
flow_weeks as (
  select date_trunc('week', d.wk)::date as week_start,
    count(*) filter (where date_trunc('week', bt.created_at) = date_trunc('week', d.wk)) as created_n,
    count(*) filter (where bt.completed_at is not null and date_trunc('week', bt.completed_at) = date_trunc('week', d.wk)) as done_n
  from generate_series(date_trunc('week', current_date) - interval '11 weeks', date_trunc('week', current_date), interval '1 week') d(wk)
  left join base_tasks bt on true
  group by date_trunc('week', d.wk)
  order by 1
),

-- ============================================================
-- Horas registradas por espacio: 8 semanas, una serie por espacio (para
-- el gráfico apilado). Mismas 8 semanas que projects_weekly, a nivel de
-- espacio en vez de proyecto.
-- ============================================================
hours_by_space as (
  select bt.space_id, date_trunc('week', d.wk)::date as week_start,
    coalesce(round(sum(te.minutes) / 60.0)::int, 0) as hrs
  from (select distinct space_id from base_tasks where space_id is not null) sp
  cross join generate_series(date_trunc('week', current_date) - interval '7 weeks', date_trunc('week', current_date), interval '1 week') d(wk)
  join base_tasks bt on bt.space_id = sp.space_id
  left join public.time_entries te on te.node_id = bt.id and date_trunc('week', te.entry_date) = date_trunc('week', d.wk)
  group by bt.space_id, date_trunc('week', d.wk)
),

-- ============================================================
-- Necesita atención: los 5 grupos del mockup
-- ============================================================
att_overdue7 as (
  select bt.id, bt.title, bt.due_date,
    p.title as project_title, sp.title as space_title,
    (select string_agg(pr.full_name, ', ') from public.task_assignees ta2
      join public.profiles pr on pr.id = ta2.user_id where ta2.node_id = bt.id) as assignees
  from open_tasks bt
  left join public.nodes p on p.id = bt.project_id
  left join public.nodes sp on sp.id = bt.space_id
  where bt.due_date is not null and bt.due_date < current_date - 7
  order by bt.due_date asc
),
att_away as (
  select bt.id, bt.title, bt.due_date,
    p.title as project_title, sp.title as space_title,
    pr.full_name as assignee_name, tof.starts_on, tof.ends_on
  from open_tasks bt
  join public.task_assignees ta on ta.node_id = bt.id
  join public.profiles pr on pr.id = ta.user_id
  join public.time_off tof on tof.user_id = ta.user_id
  left join public.nodes p on p.id = bt.project_id
  left join public.nodes sp on sp.id = bt.space_id
  where bt.due_date is not null and bt.due_date >= tof.starts_on and bt.due_date <= tof.ends_on
),
att_blocked as (
  select bt.id, bt.title,
    p.title as project_title,
    pn.title as pred_title, coalesce(pn_s.status_kind, 'neutral') as pred_status_kind
  from open_tasks bt
  join public.task_dependencies td on td.successor_id = bt.id
  join public.nodes pn on pn.id = td.predecessor_id
  left join public.statuses pn_s on pn_s.id = pn.status_id
  left join public.nodes p on p.id = bt.project_id
  where coalesce(pn_s.status_kind, '') != 'success'
),
att_reviews as (
  select bt.id, bt.title, tr.created_at as review_since, pr.full_name as reviewer_name
  from base_tasks bt
  join public.task_reviewers tr on tr.node_id = bt.id
  join public.profiles pr on pr.id = tr.user_id
  where tr.status = 'pending' and tr.created_at < now() - interval '3 days'
),
att_unassigned as (
  select bt.id, bt.title, bt.due_date, p.title as project_title, sp.title as space_title
  from open_tasks bt
  left join public.nodes p on p.id = bt.project_id
  left join public.nodes sp on sp.id = bt.space_id
  where not exists (select 1 from public.task_assignees ta where ta.node_id = bt.id)
),

-- ============================================================
-- Portafolio por espacio/lista: avance (status_kind), vencidas, a tiempo,
-- próximo hito, horas y cierres de las últimas 8 semanas.
-- ============================================================
projects_agg as (
  select
    bt.space_id,
    bt.project_id,
    count(*) filter (where bt.status_kind = 'success') as st_success,
    count(*) filter (where bt.status_kind = 'warning') as st_warning,
    count(*) filter (where bt.status_kind = 'danger') as st_danger,
    count(*) filter (where bt.status_kind = 'neutral') as st_neutral,
    count(*) filter (where bt.status_kind = 'dropped') as st_dropped,
    count(*) filter (where bt.status_kind not in ('success', 'dropped')) as open_n,
    count(*) filter (where bt.status_kind not in ('success', 'dropped') and bt.due_date < current_date) as overdue_n,
    count(*) filter (where bt.status_kind = 'success' and bt.due_date is not null) as closed_with_due_n,
    count(*) filter (where bt.status_kind = 'success' and bt.due_date is not null and bt.completed_at::date <= bt.due_date) as ontime_n
  from base_tasks bt
  where bt.project_id is not null
  group by bt.space_id, bt.project_id
),
projects_hours as (
  select bt.project_id, coalesce(round(sum(te.minutes) / 60.0)::int, 0) as hrs
  from public.time_entries te
  join base_tasks bt on bt.id = te.node_id
  join bounds on true
  where te.entry_date >= bounds.start_date and te.entry_date < bounds.end_date
  group by bt.project_id
),
projects_next_ms as (
  select distinct on (bt.project_id)
    bt.project_id, bt.title, bt.due_date,
    (bt.status_kind not in ('success', 'dropped') and bt.due_date < current_date) as overdue
  from base_tasks bt
  where bt.is_milestone and bt.status_kind not in ('success', 'dropped')
  order by bt.project_id, bt.due_date asc nulls last
),
projects_weekly as (
  select t.project_id, date_trunc('week', d.wk)::date as week_start,
    count(*) filter (where t.completed_at is not null and date_trunc('week', t.completed_at) = date_trunc('week', d.wk)) as done_n
  from (select distinct project_id from base_tasks where project_id is not null) proj_ids
  cross join generate_series(date_trunc('week', current_date) - interval '7 weeks', date_trunc('week', current_date), interval '1 week') d(wk)
  join base_tasks t on t.project_id = proj_ids.project_id
  group by t.project_id, date_trunc('week', d.wk)
),

-- ============================================================
-- Hitos: próximos 30 días y vencidos, con sus predecesoras
-- ============================================================
milestones as (
  select
    bt.id, bt.title, bt.due_date,
    p.title as project_title, sp.title as space_title,
    (select count(*) from public.task_dependencies td where td.successor_id = bt.id) as pred_total,
    (select count(*) from public.task_dependencies td
      join public.nodes pn on pn.id = td.predecessor_id
      left join public.statuses pn_s on pn_s.id = pn.status_id
      where td.successor_id = bt.id and pn_s.status_kind = 'success') as pred_done
  from base_tasks bt
  left join public.nodes p on p.id = bt.project_id
  left join public.nodes sp on sp.id = bt.space_id
  where bt.is_milestone
    and bt.status_kind not in ('success', 'dropped')
    and bt.due_date is not null
    and bt.due_date < current_date + 30
  order by bt.due_date asc
),

-- ============================================================
-- Personas: carga por prioridad, vencidas, vencen en 7 días, horas de la
-- semana, revisiones pendientes y ausencia activa.
-- ============================================================
people_base as (
  select ta.user_id, bt.id as task_id, bt.priority, bt.due_date, bt.status_kind
  from base_tasks bt
  join public.task_assignees ta on ta.node_id = bt.id
  where bt.status_kind not in ('success', 'dropped')
),
people_agg as (
  select
    pb.user_id,
    count(*) filter (where priority = 'urgent') as p_urgent,
    count(*) filter (where priority = 'high') as p_high,
    count(*) filter (where priority = 'medium') as p_medium,
    count(*) filter (where priority = 'low') as p_low,
    count(*) filter (where due_date is not null and due_date < current_date) as overdue_n,
    count(*) filter (where due_date is not null and due_date >= current_date and due_date < current_date + 7) as due_soon_n
  from people_base pb
  group by pb.user_id
),
people_hours as (
  select te.user_id, coalesce(round(sum(te.minutes) / 60.0)::int, 0) as hrs
  from public.time_entries te, bounds
  where te.entry_date >= date_trunc('week', current_date)::date and te.entry_date < bounds.end_date
    and te.node_id in (select id from base_tasks)
  group by te.user_id
),
people_reviews as (
  select tr.user_id, count(*)::int as n
  from public.task_reviewers tr
  where tr.status = 'pending' and tr.node_id in (select id from base_tasks)
  group by tr.user_id
),
people_away as (
  select distinct on (user_id) user_id, kind, starts_on, ends_on
  from public.time_off
  where workspace_id = p_workspace_id and current_date between starts_on and ends_on
  order by user_id, starts_on
),

-- ============================================================
-- Distribuciones: por prioridad, por etiqueta, por campo de opción única
-- ============================================================
dist_priority as (
  select priority, count(*)::int as n from open_tasks group by priority
),
dist_label as (
  select l.name, count(*)::int as n
  from open_tasks bt
  join public.task_labels tl on tl.node_id = bt.id
  join public.labels l on l.id = tl.label_id
  group by l.name
  order by n desc
  limit 8
),
dist_label_none as (
  select count(*)::int as n from open_tasks bt
  where not exists (select 1 from public.task_labels tl where tl.node_id = bt.id)
),
-- Campo de opción única: los campos son por PROYECTO (project_custom_fields,
-- 0048), no por espacio — un espacio no tiene tareas directas (0073). Sin
-- un espacio elegido no hay un nombre de campo coherente entre proyectos
-- de espacios distintos, así que esta distribución solo se llena con
-- `p_space_id` puesto; el nombre de campo se toma del más usado entre los
-- proyectos de ese espacio.
dist_field_name as (
  select pcf.name
  from public.project_custom_fields pcf
  join public.nodes proj on proj.id = pcf.project_id and proj.type = 'project'
  where p_space_id is not null and proj.space_id = p_space_id and pcf.field_type = 'select'
  group by pcf.name
  order by count(*) desc
  limit 1
),
dist_field as (
  select
    coalesce(opt.value ->> 'label', 'Sin opción') as label,
    count(*)::int as n
  from open_tasks bt
  join public.project_custom_fields pcf
    on pcf.project_id = bt.project_id and pcf.field_type = 'select' and pcf.name = (select name from dist_field_name)
  join public.task_custom_field_values v on v.node_id = bt.id and v.field_id = pcf.id
  left join lateral jsonb_array_elements(pcf.options) opt(value) on opt.value ->> 'id' = v.value #>> '{}'
  where (select name from dist_field_name) is not null
  group by 1
)

select jsonb_build_object(
  'kpis', jsonb_build_object(
    'open', (select n from kpi_open),
    'openDelta', (select n from kpi_open_prev_delta),
    'done', (select n from kpi_done),
    'doneDelta', (select kpi_done.n - kpi_done_prev.n from kpi_done, kpi_done_prev),
    'overdue', (select n from kpi_overdue),
    'overdueDelta', (select kpi_overdue.n - kpi_overdue_prev.n from kpi_overdue, kpi_overdue_prev),
    'ontimePct', (select pct from kpi_ontime),
    'cycleDays', (select days from kpi_cycle),
    'hours', (select h from kpi_hours),
    'hoursDelta', (select kpi_hours.h - kpi_hours_prev.h from kpi_hours, kpi_hours_prev)
  ),
  'attention', jsonb_build_object(
    'overdue7', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'projectTitle', project_title, 'spaceTitle', space_title,
        'dueDate', due_date, 'assignees', assignees
      )), '[]'::jsonb) from att_overdue7),
    'away', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'projectTitle', project_title, 'spaceTitle', space_title,
        'dueDate', due_date, 'assigneeName', assignee_name, 'startsOn', starts_on, 'endsOn', ends_on
      )), '[]'::jsonb) from att_away),
    'blocked', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'projectTitle', project_title,
        'predTitle', pred_title, 'predStatusKind', pred_status_kind
      )), '[]'::jsonb) from att_blocked),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'reviewSince', review_since, 'reviewerName', reviewer_name
      )), '[]'::jsonb) from att_reviews),
    'unassigned', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'projectTitle', project_title, 'spaceTitle', space_title, 'dueDate', due_date
      )), '[]'::jsonb) from att_unassigned)
  ),
  'portfolio', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'projectId', pa.project_id,
      'spaceId', pa.space_id,
      'title', proj.title,
      'stSuccess', pa.st_success, 'stWarning', pa.st_warning, 'stDanger', pa.st_danger,
      'stNeutral', pa.st_neutral, 'stDropped', pa.st_dropped,
      'openCount', pa.open_n, 'overdueCount', pa.overdue_n,
      'ontimePct', case when pa.closed_with_due_n = 0 then null
        else round(100.0 * pa.ontime_n / pa.closed_with_due_n)::int end,
      -- Conteos crudos, no solo el %: el cliente agrupa proyectos por
      -- espacio y necesita promediar ponderado, no promediar porcentajes
      -- ya redondeados (eso da un número distinto y menos preciso).
      'ontimeCount', pa.ontime_n, 'closedWithDueCount', pa.closed_with_due_n,
      'hours', coalesce(ph.hrs, 0),
      'nextMilestone', case when nm.title is null then null else jsonb_build_object(
        'title', nm.title, 'dueDate', nm.due_date, 'overdue', nm.overdue) end,
      'weekly', (select coalesce(jsonb_agg(pw.done_n order by pw.week_start), '[]'::jsonb)
        from projects_weekly pw where pw.project_id = pa.project_id)
    )), '[]'::jsonb)
    from projects_agg pa
    join public.nodes proj on proj.id = pa.project_id
    left join projects_hours ph on ph.project_id = pa.project_id
    left join projects_next_ms nm on nm.project_id = pa.project_id
  ),
  'spaces', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title)), '[]'::jsonb)
    from public.nodes where workspace_id = p_workspace_id and type = 'space'
      and id in (select distinct space_id from base_tasks where space_id is not null)
  ),
  'flow', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'weekStart', week_start, 'created', created_n, 'completed', done_n
    ) order by week_start), '[]'::jsonb) from flow_weeks
  ),
  'hoursBySpace', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'spaceId', hs.space_id, 'spaceTitle', sp.title,
      'weekly', (select coalesce(jsonb_agg(hs2.hrs order by hs2.week_start), '[]'::jsonb)
        from hours_by_space hs2 where hs2.space_id = hs.space_id)
    )), '[]'::jsonb)
    from (select distinct space_id from hours_by_space) hs
    join public.nodes sp on sp.id = hs.space_id
  ),
  'milestones', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'dueDate', due_date,
      'projectTitle', project_title, 'spaceTitle', space_title,
      'predTotal', pred_total, 'predDone', pred_done
    )), '[]'::jsonb) from milestones
  ),
  'people', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'userId', pe.user_id, 'fullName', pr.full_name, 'avatarUrl', pr.avatar_url,
      'urgent', pe.p_urgent, 'high', pe.p_high, 'medium', pe.p_medium, 'low', pe.p_low,
      'overdueCount', pe.overdue_n, 'dueSoonCount', pe.due_soon_n,
      'hours', coalesce(ph.hrs, 0), 'reviewCount', coalesce(pr2.n, 0),
      'away', case when aw.user_id is null then null else jsonb_build_object(
        'kind', aw.kind, 'startsOn', aw.starts_on, 'endsOn', aw.ends_on) end
    ) order by pe.overdue_n desc, (pe.p_urgent + pe.p_high + pe.p_medium + pe.p_low) desc), '[]'::jsonb)
    from people_agg pe
    join public.profiles pr on pr.id = pe.user_id
    left join people_hours ph on ph.user_id = pe.user_id
    left join people_reviews pr2 on pr2.user_id = pe.user_id
    left join people_away aw on aw.user_id = pe.user_id
  ),
  'distributions', jsonb_build_object(
    'priority', (select coalesce(jsonb_object_agg(priority, n), '{}'::jsonb) from dist_priority),
    'label', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'n', n)), '[]'::jsonb) from dist_label),
    'labelNone', (select n from dist_label_none),
    'fieldName', (select name from dist_field_name),
    'field', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n) order by n desc), '[]'::jsonb) from dist_field)
  )
);
$$;

revoke execute on function public.get_report_data(uuid, text, uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.get_report_data(uuid, text, uuid, uuid, uuid, boolean) to authenticated;
