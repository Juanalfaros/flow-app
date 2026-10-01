-- 0085_public_links.sql — Fase B de "privacidad de tareas y espacios":
-- link público de solo lectura, sin cuenta, para compartir una lista o
-- una tarea con alguien externo (un cliente) sin darle acceso al
-- workspace. Mismo criterio arquitectónico que `calendar_feeds`
-- (0033_calendar_feed.sql): el token largo y aleatorio ES la
-- credencial, la función que lee con ese token está concedida solo a
-- `service_role` (nunca a `anon`/`authenticated` directo), y el Worker
-- la consulta desde una ruta pública sin JWT.
--
-- Decisiones de producto ya consultadas con el usuario: solo lectura
-- (sin editar/comentar/asignar), un link por lista O por tarea
-- individual, revocable/regenerable a mano sin expiración automática ni
-- contraseña, y el responsable mostrado es solo su nombre (sin
-- email/avatar).

create table public.public_links (
  node_id uuid primary key references public.nodes(id) on delete cascade,
  -- 32 bytes en hex = 64 caracteres, mismo formato que calendar_feeds.
  token text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz
);

alter table public.public_links enable row level security;

-- Solo quien administra el workspace gestiona el link — mismo criterio
-- que `node_access_write_admin` (0028): compartir con el mundo exige más
-- permiso que compartir con un compañero. Sin policies de
-- insert/update/delete: se crea/regenera/revoca solo por RPC, para que
-- nadie pueda fijar un token elegido a mano (sería adivinable a
-- propósito).
create policy "public_links_select_admin" on public.public_links
  for select to authenticated using (
    exists (select 1 from public.nodes n
            where n.id = public_links.node_id and public.is_admin_of(n.workspace_id))
  );

create or replace function public.get_or_create_public_link(p_node_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_token text;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_node_id;
  if v_workspace_id is null then
    raise exception 'Nodo % no existe', p_node_id;
  end if;
  perform public.assert_admin_of(v_workspace_id);

  select token into v_token from public.public_links where node_id = p_node_id;
  if v_token is not null then
    return v_token;
  end if;

  -- Calificado con el esquema: `gen_random_bytes` vive en `extensions`
  -- (pgcrypto), no en `public` — sin el prefijo, resolver el nombre
  -- depende de que `extensions` esté en el search_path efectivo de la
  -- sesión que ejecuta, que no es consistente (confirmado a mano: la
  -- misma llamada sin calificar falló una vez y no otra, mismo síntoma
  -- documentado ya para `auth.uid()` en sesiones anidadas — ver
  -- project_flow_quiero_todo_backlog). Calificarlo explícito no
  -- depende de nada de eso.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.public_links (node_id, token, created_by) values (p_node_id, v_token, auth.uid());
  return v_token;
end;
$$;

-- Regenerar invalida el anterior al toque — es la salida cuando alguien
-- comparte el enlace por error (mismo botón que ya existe para el feed
-- de calendario).
create or replace function public.regenerate_public_link(p_node_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_token text;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_node_id;
  if v_workspace_id is null then
    raise exception 'Nodo % no existe', p_node_id;
  end if;
  perform public.assert_admin_of(v_workspace_id);

  -- Calificado con el esquema: `gen_random_bytes` vive en `extensions`
  -- (pgcrypto), no en `public` — sin el prefijo, resolver el nombre
  -- depende de que `extensions` esté en el search_path efectivo de la
  -- sesión que ejecuta, que no es consistente (confirmado a mano: la
  -- misma llamada sin calificar falló una vez y no otra, mismo síntoma
  -- documentado ya para `auth.uid()` en sesiones anidadas — ver
  -- project_flow_quiero_todo_backlog). Calificarlo explícito no
  -- depende de nada de eso.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.public_links (node_id, token, created_by)
  values (p_node_id, v_token, auth.uid())
  on conflict (node_id) do update
    set token = excluded.token, created_at = now(), created_by = excluded.created_by, last_accessed_at = null;
  return v_token;
end;
$$;

create or replace function public.revoke_public_link(p_node_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.nodes where id = p_node_id;
  if v_workspace_id is null then
    raise exception 'Nodo % no existe', p_node_id;
  end if;
  perform public.assert_admin_of(v_workspace_id);
  delete from public.public_links where node_id = p_node_id;
end;
$$;

revoke execute on function public.get_or_create_public_link(uuid) from public, anon;
revoke execute on function public.regenerate_public_link(uuid) from public, anon;
revoke execute on function public.revoke_public_link(uuid) from public, anon;
grant execute on function public.get_or_create_public_link(uuid) to authenticated;
grant execute on function public.regenerate_public_link(uuid) to authenticated;
grant execute on function public.revoke_public_link(uuid) to authenticated;

-- ============================================================
-- La lectura pública — la consume el Worker con service_role
-- ============================================================
-- Proyección de SOLO LECTURA, deliberadamente angosta: título, estado,
-- prioridad, fecha, etiquetas y el NOMBRE (no email/avatar) de quien
-- responde. Nada de comentarios, actividad ni adjuntos — es contenido
-- interno del equipo, no algo para un link que puede terminar en
-- cualquier bandeja de entrada.
--
-- `jsonb` de retorno (no `returns table`) porque las dos formas son
-- genuinamente distintas: una lista devuelve su propio nombre + un
-- array de tareas; una tarea devuelve sus propios campos (incluida la
-- descripción, que sí tiene sentido mostrar para UNA tarea puntual) +
-- un array de subtareas. Forzar un único shape de tabla hubiera dejado
-- columnas siempre null según el caso.
create or replace function public.public_link_view(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_node_id uuid;
  v_type text;
  v_result jsonb;
begin
  select pl.node_id, n.type into v_node_id, v_type
    from public.public_links pl join public.nodes n on n.id = pl.node_id
    where pl.token = p_token;

  -- Token inválido o el nodo ya no existe: null sin distinguir el
  -- motivo, mismo criterio que calendar_feed_events (0033) — un 404
  -- explícito confirmaría que el token es válido.
  if v_node_id is null then
    return null;
  end if;

  update public.public_links set last_accessed_at = now() where token = p_token;

  if v_type = 'project' then
    select jsonb_build_object(
      'kind', 'project',
      'title', n.title,
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'status_name', s.name,
          'status_kind', s.status_kind,
          'priority', t.priority,
          'due_date', t.due_date,
          'assignee_name', p.full_name,
          'labels', coalesce((
            select jsonb_agg(jsonb_build_object('name', l.name, 'color', l.color))
            from public.task_labels tl join public.labels l on l.id = tl.label_id
            where tl.node_id = t.id
          ), '[]'::jsonb)
        ) order by nm.position)
        from public.node_memberships nm
        join public.nodes t on t.id = nm.node_id
        left join public.statuses s on s.id = t.status_id
        left join public.profiles p on p.id = t.assignee_id
        where nm.container_id = v_node_id and t.type = 'task'
      ), '[]'::jsonb)
    ) into v_result
    from public.nodes n where n.id = v_node_id;
  else
    select jsonb_build_object(
      'kind', 'task',
      'title', t.title,
      'description', t.description,
      'status_name', s.name,
      'status_kind', s.status_kind,
      'priority', t.priority,
      'due_date', t.due_date,
      'assignee_name', p.full_name,
      'labels', coalesce((
        select jsonb_agg(jsonb_build_object('name', l.name, 'color', l.color))
        from public.task_labels tl join public.labels l on l.id = tl.label_id
        where tl.node_id = t.id
      ), '[]'::jsonb),
      'subtasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', st.id,
          'title', st.title,
          'status_name', ss.name,
          'status_kind', ss.status_kind,
          'priority', st.priority,
          'due_date', st.due_date,
          'assignee_name', sp.full_name
        ))
        from public.nodes st
        left join public.statuses ss on ss.id = st.status_id
        left join public.profiles sp on sp.id = st.assignee_id
        where st.parent_id = v_node_id and st.type = 'task'
      ), '[]'::jsonb)
    ) into v_result
    from public.nodes t
    left join public.statuses s on s.id = t.status_id
    left join public.profiles p on p.id = t.assignee_id
    where t.id = v_node_id;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.public_link_view(text) from public, anon, authenticated;
grant execute on function public.public_link_view(text) to service_role;
