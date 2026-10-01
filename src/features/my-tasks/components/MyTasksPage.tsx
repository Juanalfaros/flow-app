import { useEffect } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { MyWorkWidget } from '@/features/my-tasks/components/MyWorkWidget'
import { PersonalListWidget } from '@/features/my-tasks/components/PersonalListWidget'
import { PrioritiesWidget } from '@/features/my-tasks/components/PrioritiesWidget'
import { AssignedCommentsWidget } from '@/features/my-tasks/components/AssignedCommentsWidget'
import { RecentWidget } from '@/features/my-tasks/components/RecentWidget'

interface MyTasksPageProps {
  workspaceId: string
  userId: string | undefined
  tab: 'asignado' | 'personal'
  /** Atajo "Nueva tarea" del ícono de la PWA — además de hacer scroll,
   * enfoca el input de "Lista personal" (PersonalListWidget). */
  focusCreate?: boolean
}

export function MyTasksPage({ workspaceId, userId, tab, focusCreate }: MyTasksPageProps) {
  // Los sub-links del sidebar ("Asignado a mí" / "Lista personal")
  // navegan a esta misma página con `?tab=` — en vez de rutas separadas,
  // solo hacen scroll al widget correspondiente (todo vive en una sola
  // página tipo dashboard, igual que ClickUp).
  useEffect(() => {
    if (tab === 'personal') {
      document.getElementById('lista-personal')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [tab])

  return (
    <PageShell width="app">
      <h1 className="text-lg font-medium">Mis tareas</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MyWorkWidget workspaceId={workspaceId} userId={userId} />
        <div id="lista-personal">
          <PersonalListWidget workspaceId={workspaceId} userId={userId} autoFocusCreate={focusCreate} />
        </div>
        <PrioritiesWidget workspaceId={workspaceId} userId={userId} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AssignedCommentsWidget userId={userId} />
        <RecentWidget userId={userId} />
      </div>
    </PageShell>
  )
}
