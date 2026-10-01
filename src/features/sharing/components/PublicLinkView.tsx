import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon, Task01Icon, Alert01Icon } from '@hugeicons/core-free-icons'
import { fetchPublicLinkView, type PublicLinkData, type PublicLinkTaskRow } from '@/features/sharing/public-link'
import { sanitizeDescriptionHtml } from '@/lib/sanitize-html'
import { STATUS_KIND_BADGE } from '@/features/projects/status-kind'
import { PRIORITY_BADGE, PRIORITY_LABEL } from '@/features/tasks/priority'
import { formatNumericDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

// Página pública de solo lectura (0085_public_links.sql) — sin sesión,
// sin sidebar/topbar, sin ningún control de editar/comentar/asignar. La
// data ya viene filtrada a lo mínimo desde el servidor
// (`public_link_view`, service_role): nunca comentarios, actividad ni
// adjuntos. Reusa los mismos tokens visuales que el resto de la app
// (STATUS_KIND_BADGE/PRIORITY_BADGE) para que no se sienta una página
// aparte del producto.
export function PublicLinkView({ token }: { token: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['public-link-view', token] as const,
    queryFn: () => fetchPublicLinkView(token),
    retry: false,
  })

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border px-4 py-3 @min-[640px]:px-6">
        <span className="font-mono text-sm tracking-wide text-text-muted">Flow</span>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 @min-[640px]:px-6">
        {isPending && (
          <div className="animate-pulse">
            <div className="mb-6 h-7 w-2/3 rounded-md bg-surface-alt" />
            <div className="h-40 rounded-md bg-surface-alt" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-8 text-center shadow-card">
            <HugeiconsIcon icon={Alert01Icon} className="size-6 text-text-muted" />
            <p className="text-sm text-text-secondary">{error.message}</p>
          </div>
        )}

        {data && (data.kind === 'project' ? <ProjectView data={data} /> : <TaskView data={data} />)}
      </main>
    </div>
  )
}

function ProjectView({ data }: { data: Extract<PublicLinkData, { kind: 'project' }> }) {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-text">{data.title}</h1>
      <p className="mb-6 text-xs text-text-muted">
        Vista de solo lectura · {data.tasks.length} tarea{data.tasks.length === 1 ? '' : 's'}
      </p>
      {data.tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-1.5">
          {data.tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskView({ data }: { data: Extract<PublicLinkData, { kind: 'task' }> }) {
  return (
    <div>
      <h1 className="mb-3 text-xl font-semibold text-text">{data.title}</h1>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {data.status_name && (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_KIND_BADGE[data.status_kind ?? 'neutral'])}>
            {data.status_name}
          </span>
        )}
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_BADGE[data.priority])}>
          {PRIORITY_LABEL[data.priority] ?? data.priority}
        </span>
        {data.due_date && (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <HugeiconsIcon icon={Calendar01Icon} className="size-3" />
            {formatNumericDate(data.due_date, 'dd/MM/yyyy')}
          </span>
        )}
        {data.assignee_name && <span className="text-xs text-text-muted">Responsable: {data.assignee_name}</span>}
      </div>
      {data.labels.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {data.labels.map((l) => (
            <span
              key={l.name}
              className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: l.color ?? undefined }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      {data.description && (
        // Página pública SIN sesión (mismo origen donde supabase-js guarda
        // el token en localStorage) — a diferencia de TaskDescriptionEditor
        // (que sanea "gratis" al montar el HTML dentro de TipTap, contra su
        // propio schema), acá no hay editor de por medio: `description` se
        // escribe directo contra PostgREST y puede traer HTML arbitrario.
        // Saneado con allowlist antes de inyectar (ver sanitize-html.ts).
        // eslint-disable-next-line react/no-danger -- HTML ya saneado por sanitizeDescriptionHtml, no el original.
        <div
          className="prose prose-sm mb-6 max-w-none text-text-secondary"
          dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(data.description) }}
        />
      )}
      {data.subtasks.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-text">Subtareas</h2>
          <div className="flex flex-col gap-1.5">
            {data.subtasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({ task }: { task: PublicLinkTaskRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-3 py-2 shadow-card">
      <span className="min-w-0 flex-1 truncate text-sm text-text">{task.title}</span>
      {task.status_name && (
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', STATUS_KIND_BADGE[task.status_kind ?? 'neutral'])}>
          {task.status_name}
        </span>
      )}
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_BADGE[task.priority])}>
        {PRIORITY_LABEL[task.priority] ?? task.priority}
      </span>
      {task.due_date && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
          <HugeiconsIcon icon={Calendar01Icon} className="size-3" />
          {formatNumericDate(task.due_date, 'dd/MM/yyyy')}
        </span>
      )}
      {task.assignee_name && <span className="shrink-0 text-xs text-text-muted">{task.assignee_name}</span>}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-10 text-center">
      <HugeiconsIcon icon={Task01Icon} className="size-5 text-text-muted/60" />
      <p className="text-sm text-text-muted">Todavía no hay tareas acá.</p>
    </div>
  )
}
