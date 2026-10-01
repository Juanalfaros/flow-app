import { useMemo } from 'react'
import { useSession } from '@/features/auth/queries'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useProjects } from '@/features/projects/queries'
import { PageShell } from '@/components/layout/PageShell'
import { DayHeader } from '@/features/home/components/DayHeader'
import { ActionNeeded } from '@/features/home/components/ActionNeeded'
import { AgendaSection } from '@/features/home/components/AgendaSection'
import { WeekStripSection } from '@/features/home/components/WeekStripSection'
import { UnreadSection } from '@/features/home/components/UnreadSection'
import { TeamSection } from '@/features/home/components/TeamSection'
import { TimeSection } from '@/features/home/components/TimeSection'
import { ActiveListsSection } from '@/features/home/components/ActiveListsSection'
import { FavoriteProjectsSection } from '@/features/home/components/FavoriteProjectsSection'
import { useMyOpenTasks, usePendingReviews, useRecentlyUnblocked } from '@/features/home/queries'
import { formatDeliveryState } from '@/features/tasks/delivery-state'
import { isClosedStatus } from '@/features/projects/status-kind'

// Rediseño de Inicio ("Resumen del día", mockup
// https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy) — serie completa
// (PR 1-5): cabecera, "Necesita tu acción" + "Tu agenda" (lado a lado en
// escritorio, apiladas bajo los 900px del `.grid-a` del mockup —
// `@min-[900px]:`, no `md:`, mismo motivo que PageShell: el ancestro real
// es el `@container` de AppShell, no el viewport), "Esta semana", "Sin
// leer" + "Tu equipo" + "Tu tiempo" (mismo corte de 900px) y "Tus listas
// activas" al final. `ProjectsQuickAccessSection` ("Listas", la grilla
// plana de todos los proyectos) sale de acá: "Tus listas activas" es su
// reemplazo real del mockup — muestra lo mismo que importa (dónde tengo
// tareas abiertas) con más contexto (cuántas, qué vence primero, avance),
// en vez de listar TODOS los proyectos aunque no tengan nada pendiente.
export function HomeDashboard({ workspaceId }: { workspaceId: string }) {
  const { data: session } = useSession()
  const userId = session?.user.id
  const { data: members } = useWorkspaceMembers(workspaceId)
  const me = members?.find((m) => m.user_id === userId)
  const firstName = me?.profile?.full_name?.split(' ')[0]

  const { data: openTasks } = useMyOpenTasks(workspaceId, userId)
  const { data: reviews } = usePendingReviews(userId)
  const { data: unblocked } = useRecentlyUnblocked(userId)
  const { data: projects } = useProjects(workspaceId)

  const projectsById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  const brief = useMemo(() => {
    const active = (openTasks ?? []).filter((t) => !isClosedStatus(t.status?.status_kind))
    let overdueCount = 0
    let dueTodayCount = 0
    let firstDueTime: string | null = null
    for (const t of active) {
      const delivery = formatDeliveryState(t.due_date, false, null)
      if (!delivery) continue
      if (delivery.state === 'overdue') overdueCount++
      else if (delivery.state === 'today') {
        dueTodayCount++
        if (t.due_time && (!firstDueTime || t.due_time < firstDueTime)) firstDueTime = t.due_time
      }
    }
    return { overdueCount, dueTodayCount, firstDueTime, pendingReviewCount: (reviews ?? []).length }
  }, [openTasks, reviews])

  return (
    <PageShell width="app">
      <div className="flex flex-col gap-7">
        <DayHeader firstName={firstName} workspaceId={workspaceId} userId={userId} {...brief} />

        <div className="grid grid-cols-1 gap-7 @min-[900px]:grid-cols-[minmax(0,7fr)_1px_minmax(0,5fr)]">
          <ActionNeeded
            workspaceId={workspaceId}
            userId={userId}
            openTasks={openTasks ?? []}
            reviews={reviews ?? []}
            unblocked={unblocked ?? []}
            projectsById={projectsById}
          />
          <div className="hidden bg-border @min-[900px]:block" />
          <AgendaSection workspaceId={workspaceId} openTasks={openTasks ?? []} />
        </div>

        <WeekStripSection workspaceId={workspaceId} userId={userId} openTasks={openTasks ?? []} />

        <div className="h-px bg-border" />

        <div className="grid grid-cols-1 gap-7 @min-[900px]:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)_1px_minmax(0,1fr)]">
          <UnreadSection workspaceId={workspaceId} userId={userId} />
          <div className="hidden bg-border @min-[900px]:block" />
          <TeamSection workspaceId={workspaceId} userId={userId} />
          <div className="hidden bg-border @min-[900px]:block" />
          <TimeSection workspaceId={workspaceId} userId={userId} />
        </div>

        <ActiveListsSection workspaceId={workspaceId} openTasks={openTasks ?? []} reviews={reviews ?? []} projectsById={projectsById} />
      </div>

      <FavoriteProjectsSection userId={userId} className="mt-7 md:hidden" />
    </PageShell>
  )
}
