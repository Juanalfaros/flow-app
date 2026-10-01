import { HugeiconsIcon } from '@hugeicons/react'
import { Folder02Icon } from '@hugeicons/core-free-icons'
import { NewProjectDialog } from '@/features/projects/components/NewProjectDialog'

export function EmptyWorkspaceState({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-card bg-accent-soft">
        <HugeiconsIcon icon={Folder02Icon} className="size-6 text-accent" />
      </div>
      <div>
        <h1 className="text-lg font-medium">Crea tu primera lista</h1>
        <p className="mt-1 text-sm text-text-muted">
          Una lista agrupa tareas relacionadas, con vistas de Board, Calendario y Gantt. Empieza por acá.
        </p>
      </div>
      {workspaceId && <NewProjectDialog workspaceId={workspaceId} />}
    </div>
  )
}
