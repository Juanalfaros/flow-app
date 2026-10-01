import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProjects, workspaceStatusesQueryOptions } from '@/features/projects/queries'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import type { ActivityContext } from '@/features/activity/describe'

/**
 * El contexto que `describeActivity` necesita para traducir un payload crudo.
 *
 * El trigger de `activity_log` guarda ids (de estado, de persona), no nombres:
 * son un snapshot del `before`/`after` de la fila. Para decir "cambió el estado
 * de Pendiente a En curso" hay que resolverlos, y eso requiere dos queries más
 * los Maps de índice.
 *
 * Estaba armado a mano en RecentActivitySection y habría que repetirlo igual en
 * cada consumidor nuevo del feed. Todas las queries que usa ya están cacheadas
 * por otras vistas, así que llamarlo desde varios lugares no agrega requests.
 */
export function useActivityContext(workspaceId: string): ActivityContext {
  const { data: projects } = useProjects(workspaceId)
  const projectIds = useMemo(() => (projects ?? []).map((p) => p.id), [projects])
  const { data: statuses } = useQuery(workspaceStatusesQueryOptions(projectIds))
  const { data: members } = useWorkspaceMembers(workspaceId)

  const statusesById = useMemo(() => new Map((statuses ?? []).map((s) => [s.id, { name: s.name }])), [statuses])
  const membersById = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, { full_name: m.profile?.full_name ?? null }])),
    [members],
  )

  return { statusesById, membersById }
}
