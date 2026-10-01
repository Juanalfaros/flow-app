-- 0055_comment_threading.sql — F5 #5: comentarios con respuestas.
-- Alcance cerrado con el usuario: texto plano (sin TipTap, CommentForm.tsx
-- no cambia de composer), anidamiento libre (sin límite de profundidad).
--
-- Las policies de comments (comments_select/comments_insert_self, 0035)
-- NO cambian: ya filtran por `node_id`, que toda respuesta hereda igual
-- que su comentario raíz — la RLS no recorre la cadena de `parent_id`
-- (mismo patrón que `nodes.parent_id`, confirmado antes de escribir esto).

alter table public.comments add column parent_id uuid references public.comments(id) on delete cascade;
create index idx_comments_parent_id on public.comments(parent_id);

-- Guardia aparte de la RLS: nada impide hoy, a nivel de datos, que un
-- cliente mande un `parent_id` que apunte a un comentario de OTRA tarea
-- (la RLS solo valida que el `node_id` del propio insert sea accesible,
-- no que coincida con el de su padre). `parent_id` referencia una fila
-- que YA EXISTE (comentario padre, comprometido antes de este insert),
-- así que a diferencia de `nodes_access` (0035/0052) esta lectura no
-- sufre ningún problema de visibilidad — es un SELECT normal sobre una
-- fila preexistente.
create or replace function public.enforce_comment_parent_same_node()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_parent_node_id uuid;
begin
  if new.parent_id is not null then
    select node_id into v_parent_node_id from public.comments where id = new.parent_id;
    if v_parent_node_id is distinct from new.node_id then
      raise exception 'Un comentario no puede responder a un comentario de otra tarea';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_comment_parent_same_node
  before insert on public.comments
  for each row execute function public.enforce_comment_parent_same_node();

-- notify_from_comment (0016) ganaba solo assignee+creador del nodo — una
-- respuesta también debería avisarle a quien escribió el comentario
-- padre, que hoy se entera únicamente si además es el assignee/creador.
-- `select distinct` sobre los tres candidatos deduplica solo (si el autor
-- del padre YA es el assignee, no manda dos notificaciones) y sigue
-- excluyendo auto-notificación.
create or replace function public.notify_from_comment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_assignee_id uuid;
  v_created_by uuid;
  v_parent_author_id uuid;
  v_recipient uuid;
begin
  select workspace_id, assignee_id, created_by into v_workspace_id, v_assignee_id, v_created_by
  from public.nodes where id = new.node_id;

  if new.parent_id is not null then
    select author_id into v_parent_author_id from public.comments where id = new.parent_id;
  end if;

  for v_recipient in
    select distinct r from (values (v_assignee_id), (v_created_by), (v_parent_author_id)) as recipients(r)
    where r is not null and r != new.author_id
  loop
    insert into public.notifications (workspace_id, recipient_id, actor_id, node_id, type, payload)
    values (v_workspace_id, v_recipient, new.author_id, new.node_id, 'comment', jsonb_build_object('comment_id', new.id));
  end loop;
  return new;
end;
$$;

comment on column public.comments.parent_id is
  'Comentario al que responde (null = comentario raíz). Anidamiento libre — ver build-comment-tree.ts para el árbol client-side.';
