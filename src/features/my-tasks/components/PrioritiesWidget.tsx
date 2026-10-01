import { useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon } from '@hugeicons/core-free-icons'
import { useTaskPriorities } from '@/features/favorites/queries'
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton'
import { useProjects } from '@/features/projects/queries'
import { SectionCard } from '@/features/home/components/SectionCard'
import { MyTaskListItem } from '@/features/home/components/MyTaskListItem'
import type { MyTaskRow } from '@/features/tasks/queries'

interface PrioritiesWidgetProps {
  workspaceId: string
  userId: string | undefined
}

export function PrioritiesWidget({ workspaceId, userId }: PrioritiesWidgetProps) {
  const { data: favorites } = useTaskPriorities(userId)
  const { data: projects } = useProjects(workspaceId)
  const projectNameById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  return (
    <SectionCard icon={StarIcon} title="Prioridades">
      {favorites === undefined ? null : favorites.length === 0 ? (
        // Plan de corrección de layout, ronda 2 (2026-09-24): sin marco
        // punteado, mismo criterio que el resto de los vacíos de la app.
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <HugeiconsIcon icon={StarIcon} className="size-5 text-text-muted/60" />
          <p className="text-xs text-text-muted">Fija una tarea desde "Mi trabajo" para verla acá.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {favorites.map((f) => {
            // Reusa MyTaskListItem: el shape de `f.node` (favorites/queries.ts)
            // ya trae los mismos campos que MyTaskRow — `projectId` se
            // resuelve igual que en myTasksQueryOptions, vía el primer
            // membership embebido.
            const projectId = f.node.memberships[0]?.container_id ?? null
            const task: MyTaskRow = {
              id: f.node.id,
              title: f.node.name,
              status_id: f.node.status?.id ?? null,
              priority: f.node.priority,
              due_date: f.node.due_date,
              completed_at: f.node.completed_at,
              parent_id: null,
              task_labels: f.node.task_labels,
              status: f.node.status,
              projectId,
            }
            return (
              <MyTaskListItem
                key={f.node_id}
                task={task}
                projectName={projectId ? projectNameById.get(projectId) : undefined}
                action={<FavoriteButton nodeId={f.node_id} nodeName={f.node.name} nodeType="task" />}
              />
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
