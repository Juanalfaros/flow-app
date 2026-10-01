import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './index'

// Extraído de push-dispatch.ts al agregar el fallback de email (F5 #10,
// worker/email-dispatch.ts): las dos rutas de entrega (push y email)
// necesitan el mismo texto para la misma notificación, y ambas ya
// importaban de push-dispatch.ts — dejar `buildPayload` ahí habría hecho
// que email-dispatch.ts importe de push-dispatch.ts y viceversa (push
// necesita "¿ya hay push suscrito? si no, mandar email"), un ciclo de
// imports entre los dos módulos. Este archivo es el punto en común, sin
// que ninguno de los dos dependa del otro.

export interface NotificationRecord {
  id: string
  workspace_id: string
  recipient_id: string
  actor_id: string | null
  node_id: string | null
  type: string
  payload: Record<string, unknown>
}

// Espejo de ROLE_LABEL (src/features/workspace/roles.ts) — mismo motivo que
// `describe()` abajo: el Worker no comparte el árbol de `src/`, así que se
// repite el texto, no la lógica de negocio real.
const ROLE_LABEL: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  member: 'Miembro',
  restricted: 'Miembro restringido',
  guest: 'Invitado',
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
}

export function adminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
}

// Espejo de `describeNotification` (src/features/notifications/describe.ts).
// Está duplicado a propósito: ese archivo importa tipos del cliente y
// resuelve nombres de estado desde un cache de TanStack Query que acá no
// existe. Lo que sí se mantiene igual es el texto, para que la
// notificación del sistema (push o email) y la de la campana digan lo
// mismo.
function describe(notification: NotificationRecord, actorName: string, statusName: string | null): string {
  switch (notification.type) {
    case 'assigned':
      return `${actorName} te asignó esta tarea`
    case 'status_changed':
      return `${actorName} cambió el estado a "${statusName ?? '—'}"`
    case 'comment':
      return `${actorName} comentó en esta tarea`
    case 'mention':
      return `${actorName} te mencionó en un comentario`
    case 'watched_activity':
      return statusName
        ? `${actorName} cambió el estado a "${statusName}" en una tarea que sigues`
        : `${actorName} comentó en una tarea que sigues`
    case 'unblocked':
      return 'Ya puedes empezar esta tarea: se completó lo que la bloqueaba'
    case 'due_reminder':
      return 'Esta tarea venció y sigue sin completarse'
    case 'removed_from_workspace':
      return `${actorName} te quitó el acceso a este workspace`
    case 'role_changed': {
      const oldLabel = ROLE_LABEL[String(notification.payload?.['old_role'] ?? '')] ?? 'tu rol anterior'
      const newLabel = ROLE_LABEL[String(notification.payload?.['new_role'] ?? '')] ?? 'un nuevo rol'
      return `${actorName} cambió tu rol de ${oldLabel} a ${newLabel}`
    }
    case 'welcome':
      return 'Ya eres parte de este workspace'
    case 'subtask_resolved': {
      const subtaskTitle = String(notification.payload?.['subtask_title'] ?? 'tu subtarea')
      const parentTitle = String(notification.payload?.['parent_title'] ?? 'la tarea principal')
      return `Se descartó "${subtaskTitle}" al cerrar "${parentTitle}"`
    }
    case 'task_claimed': {
      // D2 ("Quién queda a cargo al crear", A5+A7) — espejo de
      // describeNotification (src/features/notifications/describe.ts).
      const taskTitle = String(notification.payload?.['task_title'] ?? '')
      return `${actorName} tomó la tarea que pediste: "${taskTitle}"`
    }
    default:
      return `${actorName} hizo un cambio`
  }
}

export async function buildPayload(client: SupabaseClient, notification: NotificationRecord): Promise<PushPayload> {
  const [actorRes, nodeRes, workspaceRes] = await Promise.all([
    notification.actor_id
      ? client.from('profiles').select('full_name').eq('id', notification.actor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    notification.node_id
      ? client
          .from('nodes')
          .select('id, title, node_memberships!node_memberships_node_id_fkey ( container_id )')
          .eq('id', notification.node_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Solo hace falta el nombre del workspace cuando no hay tarea de la
    // cual sacar un título (removed_from_workspace/role_changed/welcome,
    // 0076) — para el resto sería una consulta de más.
    !notification.node_id
      ? client.from('workspaces').select('name').eq('id', notification.workspace_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const actorName = (actorRes.data as { full_name: string | null } | null)?.full_name ?? 'Alguien'
  const node = nodeRes.data as
    | { id: string; title: string; node_memberships: { container_id: string }[] }
    | null
  const workspaceName = (workspaceRes.data as { name: string } | null)?.name ?? 'tu workspace'

  const afterStatusId = notification.payload?.['after_status_id']
  let statusName: string | null = null
  if (typeof afterStatusId === 'string') {
    const { data } = await client.from('statuses').select('name').eq('id', afterStatusId).maybeSingle()
    statusName = (data as { name: string } | null)?.name ?? null
  }

  // Mismo destino que la campana del topbar (NotificationBell.tsx): la
  // página completa de la tarea, y /bandeja cuando la notificación no
  // apunta a un nodo o el nodo ya no está en ningún contenedor — incluidos
  // los tres tipos de 0076, que nunca tienen node_id.
  const containerId = node?.node_memberships?.[0]?.container_id
  const url = node && containerId ? `/p/${containerId}/t/${node.id}` : '/bandeja'

  // Título = "de qué se trata" (el asunto del correo, en email-dispatch.ts).
  // Para una tarea es su nombre; para los tres tipos sin tarea (0076) no
  // hay nada que titular salvo el workspace, así que el título lleva el
  // mensaje completo — el cuerpo (`describe()`) igual lo repite en push.
  let title: string
  if (node) {
    title = node.title
  } else if (notification.type === 'removed_from_workspace') {
    title = `Ya no formas parte de ${workspaceName}`
  } else if (notification.type === 'role_changed') {
    title = `Tu rol en ${workspaceName} cambió`
  } else if (notification.type === 'welcome') {
    title = `Bienvenido a ${workspaceName} en Flow`
  } else {
    title = 'Flow'
  }

  return {
    title,
    body: describe(notification, actorName, statusName),
    url,
    // Agrupa por tarea: varios cambios seguidos en la misma tarea
    // reemplazan la notificación anterior en vez de apilar cinco avisos
    // en la bandeja del sistema.
    tag: node?.id ?? notification.id,
  }
}
