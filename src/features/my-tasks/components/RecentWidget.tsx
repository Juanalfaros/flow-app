import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { useRecentViews } from '@/features/recent-views/queries'
import { SectionCard } from '@/features/home/components/SectionCard'

export function RecentWidget({ userId }: { userId: string | undefined }) {
  const { data: views } = useRecentViews(userId)

  return (
    <SectionCard icon={Clock01Icon} title="Recientes">
      {views === undefined ? null : views.length === 0 ? (
        // Plan de corrección de layout, ronda 2 (2026-09-24): sin marco
        // punteado, mismo criterio que el resto de los vacíos de la app.
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <HugeiconsIcon icon={Clock01Icon} className="size-5 text-text-muted/60" />
          <p className="text-xs text-text-muted">Todavía no abriste ninguna tarea.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {views.map((v) => {
            const projectId = v.node?.memberships[0]?.container_id
            if (!v.node || !projectId) return null
            return (
              <li key={v.node_id}>
                <Link
                  to="/p/$projectId/t/$taskId"
                  params={{ projectId, taskId: v.node.id }}
                  className="flex min-h-11 items-center truncate rounded-md px-2 py-1.5 text-sm transition-colors active:bg-surface-alt hover:bg-surface-alt hover:underline"
                >
                  {v.node.title}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
