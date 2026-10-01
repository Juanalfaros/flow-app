import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { myTasksQueryOptions, delegatedTasksQueryOptions, type MyTaskRow } from '@/features/tasks/queries'
import { groupByDueBucket } from '@/features/my-tasks/date-buckets'
import { isClosedStatus, isDoneStatus } from '@/features/projects/status-kind'
import { cn } from '@/lib/utils'

/**
 * Tareas de una persona, con los mismos cortes que la vista "Mis tareas".
 *
 * No hay query nueva: `myTasksQueryOptions` y `delegatedTasksQueryOptions` ya
 * reciben el `userId` como parámetro —nunca asumieron "el usuario actual"—, así
 * que se reusan tal cual, incluida su cache. Si alguien abre su propia ficha
 * después de pasar por /mis-tareas, no se dispara ningún request.
 */
export function PersonTasksTab({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const { data: assigned, isPending } = useQuery(myTasksQueryOptions(workspaceId, userId))
  const { data: delegated } = useQuery(delegatedTasksQueryOptions(workspaceId, userId))

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    )
  }

  // "Terminado" se separa antes de agrupar por fecha: una tarea cerrada la
  // semana pasada no es "con atraso", es historia. `isDoneStatus` es el mismo
  // criterio semántico que usan board y list (status_kind, no el nombre
  // visible del estado, que el usuario puede renombrar).
  const all = assigned ?? []
  const done = all.filter((t) => isDoneStatus(t.status?.status_kind))
  // `isClosedStatus`, no `!isDoneStatus`: una tarea Descartada tampoco es
  // "abierta" — negar isDoneStatus la devolvía a los baldes de fecha como
  // si siguiera activa (ver status-kind.ts). Queda fuera de "Terminado"
  // también (ese sigue siendo estrictamente isDoneStatus): una tarea
  // descartada no debería contarse como logro, aunque tampoco aparezca
  // como pendiente.
  const open = all.filter((t) => !isClosedStatus(t.status?.status_kind))
  const buckets = groupByDueBucket(open)

  const sections: { label: string; tasks: MyTaskRow[]; tone?: 'danger' }[] = [
    { label: 'Hoy', tasks: buckets.hoy },
    { label: 'Con atraso', tasks: buckets.conAtraso, tone: 'danger' },
    { label: 'Siguiente', tasks: buckets.siguiente },
    { label: 'Sin programar', tasks: buckets.sinFecha },
    { label: 'Terminado', tasks: done },
    { label: 'Delegado', tasks: delegated ?? [] },
  ]

  if (all.length === 0 && (delegated ?? []).length === 0) {
    return <p className="text-sm text-text-muted">Sin tareas asignadas.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        <section key={section.label}>
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-text-muted uppercase">
            {section.label}
            <span className={cn('tabular-nums', section.tone === 'danger' && section.tasks.length > 0 && 'text-danger')}>
              {section.tasks.length}
            </span>
          </h3>
          {section.tasks.length === 0 ? (
            <p className="text-xs text-text-muted">—</p>
          ) : (
            <ul className="flex flex-col">
              {section.tasks.map((task) => (
                <li key={task.id}>
                  {/* Sin proyecto (tarea personal) no hay ruta a la que ir: se
                      muestra el título sin enlace en vez de un link roto. */}
                  {task.projectId ? (
                    <Link
                      to="/p/$projectId/t/$taskId"
                      params={{ projectId: task.projectId, taskId: task.id }}
                      className="block truncate rounded-md px-1.5 py-1 text-sm hover:bg-surface-alt"
                    >
                      {task.title}
                    </Link>
                  ) : (
                    <span className="block truncate px-1.5 py-1 text-sm text-text-secondary">{task.title}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
