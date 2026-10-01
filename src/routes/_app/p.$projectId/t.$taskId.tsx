import { createFileRoute } from '@tanstack/react-router'
import { NodeDetailContent } from '@/features/tasks/components/NodeDetailContent'

export const Route = createFileRoute('/_app/p/$projectId/t/$taskId')({
  component: TaskDetailPage,
})

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  // key={taskId}: navegar de una tarea a otra en página completa (mismo
  // componente de ruta) no remonta por sí solo — mismo motivo que en
  // AppShell.tsx (B-04).
  return <NodeDetailContent key={taskId} nodeId={taskId} />
}
