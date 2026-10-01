import type { NotificationRow } from '@/features/notifications/queries'
import { ROLE_LABEL } from '@/features/workspace/roles'

export interface NotificationContext {
  statusesById: Map<string, { name: string }>
}

export function describeNotification(n: NotificationRow, ctx: NotificationContext): string {
  const actor = n.actor?.full_name ?? 'Alguien'

  switch (n.type) {
    case 'assigned':
      return `${actor} te asignó esta tarea`
    case 'status_changed': {
      const payload = n.payload as unknown as { before_status_id: string | null; after_status_id: string | null }
      const toName = payload.after_status_id ? (ctx.statusesById.get(payload.after_status_id)?.name ?? '—') : '—'
      return `${actor} cambió el estado a "${toName}"`
    }
    case 'comment':
      return `${actor} comentó en esta tarea`
    case 'mention':
      return `${actor} te mencionó en un comentario`
    case 'watched_activity': {
      // Mismo payload que 'comment' (comment_id) o 'status_changed'
      // (before/after_status_id) — el trigger que la genera (0043) es el
      // mismo código, solo cambia el destinatario (seguidor, no responsable).
      const payload = n.payload as unknown as { before_status_id?: string | null; after_status_id?: string | null }
      if (payload.after_status_id) {
        const toName = ctx.statusesById.get(payload.after_status_id)?.name ?? '—'
        return `${actor} cambió el estado a "${toName}" en una tarea que sigues`
      }
      return `${actor} comentó en una tarea que sigues`
    }
    case 'unblocked':
      return 'Ya puedes empezar esta tarea: se completó lo que la bloqueaba'
    case 'due_reminder':
      // Sin `actor` a propósito (es un aviso del sistema, no de una
      // persona) — worker/automation-dispatch.ts, Automatizaciones.
      return 'Esta tarea venció y sigue sin completarse'
    case 'removed_from_workspace':
      // En la práctica nadie ve esto en la campana (0067: `is_member_of`
      // ya bloquea la lectura de notificaciones de un workspace del que
      // se salió) — se conserva por completitud de tipos, el aviso real
      // llega por correo (worker/email-dispatch.ts).
      return `${actor} te quitó el acceso a este workspace`
    case 'role_changed': {
      const payload = n.payload as unknown as { old_role: string; new_role: string }
      const oldLabel = ROLE_LABEL[payload.old_role] ?? payload.old_role
      const newLabel = ROLE_LABEL[payload.new_role] ?? payload.new_role
      return `${actor} cambió tu rol de ${oldLabel} a ${newLabel}`
    }
    case 'welcome':
      return 'Ya eres parte de este workspace'
    case 'subtask_resolved': {
      // Decisión de producto: "Cerrar con subtareas abiertas" — se avisa
      // solo cuando el default no interactivo (R6) descarta una subtarea
      // que tenía dueño sin que esa persona lo decidiera ella misma.
      const payload = n.payload as unknown as { subtask_title?: string; parent_title?: string }
      return `Se descartó "${payload.subtask_title ?? 'tu subtarea'}" al cerrar "${payload.parent_title ?? 'la tarea principal'}"`
    }
    case 'task_claimed': {
      // D2 ("Quién queda a cargo al crear"), reglas A5+A7: quien pidió
      // la tarea (created_by) se entera cuando alguien la toma al
      // moverla o completarla sin que nadie la tuviera asignada todavía.
      const payload = n.payload as unknown as { task_title?: string }
      return `${actor} tomó la tarea que pediste: "${payload.task_title ?? ''}"`
    }
    default:
      return `${actor} hizo un cambio`
  }
}
