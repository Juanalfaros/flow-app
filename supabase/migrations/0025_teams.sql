-- 0025_teams.sql — equipos: agrupaciones de personas dentro de un workspace.
--
-- Alcance de ESTA migración: agrupar y mostrar (fichas, filtros, organigrama,
-- menciones). Los equipos todavía NO otorgan acceso a nada — eso llega con la
-- capa de ACL por espacio, que se apoya en `team_members` para resolver "¿este
-- usuario está en algún equipo con permiso?". El modelo de acá ya está pensado
-- para eso: `team_members` tiene índice por `user_id`, que es la dirección en
-- la que consultará la policy.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  -- Handle tipo @brand para menciones y URLs legibles.
  handle text not null,
  description text,
  -- Color de marca del equipo (mismo criterio que `labels.color`): texto libre
  -- y no un enum, para no migrar el esquema cada vez que se suma un tono.
  color text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_teams_workspace_id on public.teams(workspace_id);
-- Único por workspace y case-insensitive: @Brand y @brand son el mismo handle
-- para quien lo escribe en una mención.
create unique index idx_teams_workspace_handle on public.teams(workspace_id, lower(handle));

create trigger trg_teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();  -- reusa la de 0001

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- La PK ya cubre "miembros de este equipo". Este índice cubre la dirección
-- inversa —"equipos de esta persona"— que usan la ficha de persona y, más
-- adelante, la policy de acceso por espacio.
create index idx_team_members_user_id on public.team_members(user_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- ============================================================
-- RLS
-- ============================================================
-- Lectura para cualquier miembro del workspace: saber quién integra qué equipo
-- es información de coordinación, no sensible — y las fichas de persona la
-- muestran a todos.
create policy "teams_select_member" on public.teams
  for select to authenticated using (public.is_member_of(workspace_id));

-- Escritura solo admin/owner: crear equipos y mover gente entre ellos es
-- administración del workspace. Cuando los equipos otorguen acceso a espacios,
-- esta policy pasa a ser también la que evita que alguien se auto-agregue a un
-- equipo para ganar permisos — por eso se restringe desde ahora y no después.
create policy "teams_write_admin" on public.teams
  for all to authenticated
  using (public.is_admin_of(workspace_id))
  with check (public.is_admin_of(workspace_id));

create policy "team_members_select_member" on public.team_members
  for select to authenticated using (
    exists (select 1 from public.teams t
            where t.id = team_members.team_id and public.is_member_of(t.workspace_id)));

create policy "team_members_write_admin" on public.team_members
  for all to authenticated
  using (
    exists (select 1 from public.teams t
            where t.id = team_members.team_id and public.is_admin_of(t.workspace_id))
  ) with check (
    exists (select 1 from public.teams t
            where t.id = team_members.team_id and public.is_admin_of(t.workspace_id))
    -- La persona agregada tiene que ser del mismo workspace: sin esto, un admin
    -- podría meter en su equipo el uuid de alguien de otro workspace, y esa
    -- fila daría acceso cuando los equipos empiecen a otorgarlo.
    and exists (
      select 1 from public.teams t
      join public.memberships m on m.workspace_id = t.workspace_id
      where t.id = team_members.team_id and m.user_id = team_members.user_id)
  );

-- No se agrega a `supabase_realtime` a propósito: los equipos cambian pocas
-- veces por semana, así que sincronizan por refetch al montar como `favorites`
-- (0013) y `recent_views` (0015). Cada tabla publicada consume cuota de
-- mensajes de Realtime, que en el tier gratuito es un recurso finito.
