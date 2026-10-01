import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Delete02Icon, Note01Icon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { personalTasksQueryOptions } from '@/features/tasks/queries'
import { useCreatePersonalTaskMutation, useToggleTaskDoneMutation } from '@/features/tasks/mutations'
import { DELETE_UNDO_DELAY_MS, useDeleteTaskMutation } from '@/features/tasks/mutations'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { SectionCard } from '@/features/home/components/SectionCard'
import { cn } from '@/lib/utils'

interface PersonalListWidgetProps {
  workspaceId: string
  userId: string | undefined
  /** Atajo "Nueva tarea" del ícono de la PWA: enfoca este input al llegar,
   * sin esperar a que la persona lo encuentre con la vista. */
  autoFocusCreate?: boolean
}

export function PersonalListWidget({ workspaceId, userId, autoFocusCreate }: PersonalListWidgetProps) {
  const { data: tasks } = useQuery(personalTasksQueryOptions(workspaceId, userId))
  const createMutation = useCreatePersonalTaskMutation(workspaceId, userId)
  const toggleMutation = useToggleTaskDoneMutation(workspaceId, userId)
  // '' de containerId: una tarea personal no tiene proyecto — el extra
  // { workspaceId, userId } es lo que hace que borrar acá también saque
  // la fila de Mi trabajo, no solo de esta lista (ver el comentario de
  // useDeleteTaskMutation en mutations.ts). Reportado por el usuario:
  // tareas de prueba que no se podían abrir ni borrar desde ningún lado.
  const deleteMutation = useDeleteTaskMutation('', { workspaceId, userId })
  const setNode = useSetNodeSearchParam()
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocusCreate) inputRef.current?.focus()
  }, [autoFocusCreate])

  function handleCreate() {
    const trimmed = title.trim()
    if (!trimmed) return
    createMutation.mutate({ title: trimmed })
    setTitle('')
  }

  // Mismo patrón de "Deshacer" que NodeDetailContent.tsx (handleDeleteTask):
  // el remove optimista de useDeleteTaskMutation ya hace desaparecer la
  // fila al toque, el DELETE real espera DELETE_UNDO_DELAY_MS y se cancela
  // si "Deshacer" marca `undoState.cancelled` antes de ese margen.
  function handleDelete(taskId: string, title: string) {
    const undoState = { cancelled: false }
    deleteMutation.mutate({ taskId, undoState })
    toast(`Se eliminó "${title}".`, {
      duration: DELETE_UNDO_DELAY_MS,
      action: { label: 'Deshacer', onClick: () => { undoState.cancelled = true } },
    })
  }

  return (
    <SectionCard icon={Note01Icon} title="Lista personal">
      <form
        className="mb-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          handleCreate()
        }}
      >
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Crear tarea…"
          className="h-8 text-sm"
        />
        <button
          type="submit"
          disabled={!title.trim() || !userId}
          aria-label="Crear tarea"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt hover:text-text disabled:pointer-events-none disabled:opacity-50"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </button>
      </form>

      {tasks === undefined ? null : tasks.length === 0 ? (
        // Plan de corrección de layout, ronda 2 (2026-09-24): sin marco
        // punteado, mismo criterio que el resto de los vacíos de la app.
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <HugeiconsIcon icon={Note01Icon} className="size-5 text-text-muted/60" />
          <p className="text-xs text-text-muted">Sin tareas personales todavía.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {tasks.map((task) => {
            const done = !!task.completed_at
            return (
              <li
                key={task.id}
                className="group flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 transition-colors active:bg-surface-alt hover:bg-surface-alt"
              >
                <Checkbox
                  checked={done}
                  onCheckedChange={(checked) => toggleMutation.mutate({ taskId: task.id, done: checked === true })}
                />
                {/* Antes esto era un <span> sin ningún manejador de click:
                    no había forma de abrir el detalle (descripción,
                    subtareas, etiquetas) de una tarea personal desde
                    acá — solo tildarla. */}
                <button
                  type="button"
                  onClick={() => setNode(task.id)}
                  className={cn('min-w-0 flex-1 truncate text-left text-sm hover:underline', done && 'text-text-muted line-through')}
                >
                  {task.title}
                </button>
                {task.due_date && <span className="shrink-0 text-xs text-text-muted">{task.due_date}</span>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Eliminar "${task.title}"`}
                  className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={() => handleDelete(task.id, task.title)}
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
