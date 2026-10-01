import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { CheckListIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  myTasksQueryOptions,
  delegatedTasksQueryOptions,
  unassignedRequestedTasksQueryOptions,
  type MyTaskRow,
  type UnassignedRequestedTaskRow,
} from '@/features/tasks/queries'
import { useProjects } from '@/features/projects/queries'
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton'
import { SectionCard } from '@/features/home/components/SectionCard'
import { MyTaskListItem } from '@/features/home/components/MyTaskListItem'
import { ResponsablePicker } from '@/features/assignees/components/ResponsablePicker'
import { groupByDueBucket } from '@/features/my-tasks/date-buckets'
import { isClosedStatus, isDoneStatus } from '@/features/projects/status-kind'
import { cn } from '@/lib/utils'

// Umbral para resaltar "hace rato que nadie la toma" (mismo tono ámbar
// ya usado en el resto de la app para "necesita atención" —
// DELIVERY_STATE_CLASS, el banner espejo de R4 en NodeDetailContent).
// Arbitrario pero razonable: media semana laboral es el punto donde "sin
// dueño" deja de ser "recién creada" y empieza a ser "se está
// olvidando".
const STALE_DAYS_THRESHOLD = 3

const BUCKET_LABELS = [
  ['hoy', 'Hoy'],
  ['conAtraso', 'Con atraso'],
  ['siguiente', 'Siguiente'],
  ['sinFecha', 'Sin programar'],
] as const

interface MyWorkWidgetProps {
  workspaceId: string
  userId: string | undefined
}

export function MyWorkWidget({ workspaceId, userId }: MyWorkWidgetProps) {
  const { data: allTasks } = useQuery(myTasksQueryOptions(workspaceId, userId))
  const { data: delegated } = useQuery(delegatedTasksQueryOptions(workspaceId, userId))
  const { data: unassigned } = useQuery(unassignedRequestedTasksQueryOptions(workspaceId, userId))
  const { data: projects } = useProjects(workspaceId)
  const projectNameById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  // `isClosedStatus`, no `!isDoneStatus`: una tarea recién Descartada no
  // está "hecha" (isDoneStatus da false), así que negar ese helper la
  // devolvía a "pendiente" — exactamente el estado que se decidió que ya
  // no está activo. Ver el comentario largo en status-kind.ts.
  const pending = useMemo(() => allTasks?.filter((t) => !isClosedStatus(t.status?.status_kind)) ?? [], [allTasks])
  const done = useMemo(() => allTasks?.filter((t) => isDoneStatus(t.status?.status_kind)) ?? [], [allTasks])
  // D2/A6: solo las que siguen activas — una tarea sin dueño que ya se
  // descartó o se dio por hecha (alguien la resolvió sin que el campo
  // assignee_id llegara a escribirse, ej. vía la opción "Descartarlas"
  // de D1) no necesita seguir molestando en esta lista.
  const unassignedOpen = useMemo(
    () => unassigned?.filter((t) => !isClosedStatus(t.status?.status_kind)) ?? [],
    [unassigned],
  )

  return (
    <SectionCard icon={CheckListIcon} title="Mi trabajo" className="md:col-span-2 md:row-span-2">
      <Tabs defaultValue="pendiente">
        <TabsList>
          <TabsTrigger value="pendiente">Pendiente</TabsTrigger>
          <TabsTrigger value="terminado">Terminado</TabsTrigger>
          <TabsTrigger value="delegado">Delegado</TabsTrigger>
          <TabsTrigger value="sinDueño" className="gap-1.5">
            Sin dueño
            {unassignedOpen.length > 0 && (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 font-mono text-[10px]">
                {unassignedOpen.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pendiente">
          <BucketedList tasks={pending} loaded={allTasks !== undefined} projectNameById={projectNameById} />
        </TabsContent>
        <TabsContent value="terminado">
          <BucketedList tasks={done} loaded={allTasks !== undefined} projectNameById={projectNameById} />
        </TabsContent>
        <TabsContent value="delegado">
          <DelegatedList tasks={delegated} loaded={delegated !== undefined} projectNameById={projectNameById} />
        </TabsContent>
        <TabsContent value="sinDueño">
          <UnassignedList
            tasks={unassignedOpen}
            loaded={unassigned !== undefined}
            projectNameById={projectNameById}
            workspaceId={workspaceId}
          />
        </TabsContent>
      </Tabs>
    </SectionCard>
  )
}

function BucketedList({
  tasks,
  loaded,
  projectNameById,
}: {
  tasks: MyTaskRow[]
  loaded: boolean
  projectNameById: Map<string, string>
}) {
  const buckets = useMemo(() => groupByDueBucket(tasks), [tasks])

  if (!loaded) return null
  if (tasks.length === 0) {
    // Plan de corrección de layout, ronda 2 (2026-09-24): sin marco
    // punteado, mismo criterio que el resto de los vacíos de la app.
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <HugeiconsIcon icon={CheckListIcon} className="size-5 text-text-muted/60" />
        <p className="text-xs text-text-muted">Nada por acá.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {BUCKET_LABELS.map(([key, label]) => {
        const rows = buckets[key]
        if (rows.length === 0) return null
        return (
          <div key={key}>
            <p className="mb-1 px-2 text-xs font-medium text-text-muted uppercase">
              {label} <span className="normal-case">({rows.length})</span>
            </p>
            <div className="flex flex-col gap-0.5">
              {rows.map((task) => (
                <MyTaskListItem
                  key={task.id}
                  task={task}
                  projectName={task.projectId ? projectNameById.get(task.projectId) : undefined}
                  action={<FavoriteButton nodeId={task.id} nodeName={task.title} nodeType="task" />}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DelegatedList({
  tasks,
  loaded,
  projectNameById,
}: {
  tasks: MyTaskRow[] | undefined
  loaded: boolean
  projectNameById: Map<string, string>
}) {
  if (!loaded) return null
  if (!tasks || tasks.length === 0) {
    // Plan de corrección de layout, ronda 2 (2026-09-24): sin marco
    // punteado, mismo criterio que el resto de los vacíos de la app.
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <HugeiconsIcon icon={CheckListIcon} className="size-5 text-text-muted/60" />
        <p className="text-xs text-text-muted">No delegaste ninguna tarea todavía.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      {tasks.map((task) => (
        <MyTaskListItem
          key={task.id}
          task={task}
          projectName={task.projectId ? projectNameById.get(task.projectId) : undefined}
          showAssignee
        />
      ))}
    </div>
  )
}

// D2 ("Quién queda a cargo al crear"), regla A6: tareas que pedí y que
// nadie tomó todavía — cada fila lleva su antigüedad ("sin dueño hace N
// días", resaltada en ámbar pasado STALE_DAYS_THRESHOLD) y un
// ResponsablePicker inline para resolverlo sin salir del widget.
function UnassignedList({
  tasks,
  loaded,
  projectNameById,
  workspaceId,
}: {
  tasks: UnassignedRequestedTaskRow[]
  loaded: boolean
  projectNameById: Map<string, string>
  workspaceId: string
}) {
  if (!loaded) return null
  if (tasks.length === 0) {
    // Plan de corrección de layout, ronda 2 (2026-09-24): sin marco
    // punteado, mismo criterio que el resto de los vacíos de la app.
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <HugeiconsIcon icon={CheckListIcon} className="size-5 text-text-muted/60" />
        <p className="text-xs text-text-muted">Todo lo que pediste ya tiene alguien a cargo.</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      {tasks.map((task) => {
        const daysSince = differenceInCalendarDays(new Date(), parseISO(task.created_at))
        const stale = daysSince >= STALE_DAYS_THRESHOLD
        return (
          <MyTaskListItem
            key={task.id}
            task={task}
            projectName={task.projectId ? projectNameById.get(task.projectId) : undefined}
            action={
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('text-[11px] whitespace-nowrap', stale ? 'font-medium text-accent-2-text-on-bg' : 'text-text-muted')}>
                  sin dueño {daysSince === 0 ? 'desde hoy' : `hace ${daysSince} día${daysSince === 1 ? '' : 's'}`}
                </span>
                {task.projectId && (
                  <ResponsablePicker
                    workspaceId={workspaceId}
                    projectId={task.projectId}
                    taskId={task.id}
                    assignedMembers={[]}
                    compact
                  />
                )}
              </div>
            }
          />
        )
      })}
    </div>
  )
}
