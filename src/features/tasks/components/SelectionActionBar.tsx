import { format } from 'date-fns'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserAdd01Icon, UserRemove01Icon, Calendar01Icon, MultiplicationSignIcon } from '@hugeicons/core-free-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useBulkUpdateTasksMutation } from '@/features/tasks/mutations'
import { confirmWithUndo } from '@/lib/undo-toast'
import { formatShortDate } from '@/lib/format-date'
import { useBulkAssignMutation } from '@/features/assignees/mutations'

interface SelectionActionBarProps {
  projectId: string
  workspaceId: string
  selectedIds: Set<string>
  onClear: () => void
  assignOpen: boolean
  onAssignOpenChange: (open: boolean) => void
  dateOpen: boolean
  onDateOpenChange: (open: boolean) => void
}

export function SelectionActionBar({
  projectId,
  workspaceId,
  selectedIds,
  onClear,
  assignOpen,
  onAssignOpenChange,
  dateOpen,
  onDateOpenChange,
}: SelectionActionBarProps) {
  const { data: members } = useWorkspaceMembers(workspaceId)
  const bulkMutation = useBulkUpdateTasksMutation(projectId)
  const bulkAssignMutation = useBulkAssignMutation(projectId)

  if (selectedIds.size === 0) return null

  const taskIds = [...selectedIds]

  return (
    <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
      {/* `flex-wrap`+`max-w-full` (antes ninguno de los dos): en un
          teléfono de 390px el contenido pedía ~400px y se cortaba por los
          dos lados (R-05). */}
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-panel border border-border bg-surface p-2 shadow-panel">
        <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground tabular-nums">
          {selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}
        </span>

        {/* Dos acciones explícitas sobre task_assignees (0041), no un
            <Select> de valor único escribiendo el escalar assignee_id: con
            N tareas seleccionadas no hay "el" asignado actual que
            mostrar, y "Sin asignar" nunca borraba la fila de
            task_assignees del asignado anterior (B-02) — el trigger de
            sync sólo va de assignee_id hacia la tabla, nunca al revés.
            Cada acción pasa por confirmWithUndo (F-06): antes se aplicaba
            al toque, sin ningún margen — reasignar 20 tareas por error
            significaba deshacerlas una por una. */}
        <Popover open={assignOpen} onOpenChange={onAssignOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="bg-bg">
              <HugeiconsIcon icon={UserAdd01Icon} />
              {/* Sufijo de atajo sólo con teclado real (R-05): "(A)"/"(D)" en
                  un dispositivo táctil sólo confunden, no hay tecla que
                  apretar. */}
              Asignados… <span className="hidden [@media(hover:hover)]:inline">(A)</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2">
            <div className="flex flex-col gap-1">
              <span className="px-1 text-xs font-medium text-text-muted uppercase">Agregar asignado</span>
              {members?.map((m) => (
                <button
                  key={`add-${m.user_id}`}
                  type="button"
                  className="flex items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-surface-alt"
                  onClick={() => {
                    const label = m.profile?.full_name ?? 'esa persona'
                    onAssignOpenChange(false)
                    confirmWithUndo(
                      `${taskIds.length} tarea${taskIds.length === 1 ? '' : 's'} → + ${label}.`,
                      () => bulkAssignMutation.mutate({ taskIds, userId: m.user_id, action: 'add' }),
                    )
                  }}
                >
                  <HugeiconsIcon icon={UserAdd01Icon} className="size-3.5 text-text-muted" />
                  {m.profile?.full_name ?? m.user_id}
                </button>
              ))}
              <span className="mt-1 px-1 text-xs font-medium text-text-muted uppercase">Quitar asignado</span>
              {members?.map((m) => (
                <button
                  key={`remove-${m.user_id}`}
                  type="button"
                  className="flex items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-surface-alt"
                  onClick={() => {
                    const label = m.profile?.full_name ?? 'esa persona'
                    onAssignOpenChange(false)
                    confirmWithUndo(
                      `${taskIds.length} tarea${taskIds.length === 1 ? '' : 's'} → − ${label}.`,
                      () => bulkAssignMutation.mutate({ taskIds, userId: m.user_id, action: 'remove' }),
                    )
                  }}
                >
                  <HugeiconsIcon icon={UserRemove01Icon} className="size-3.5 text-text-muted" />
                  {m.profile?.full_name ?? m.user_id}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={dateOpen} onOpenChange={onDateOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="bg-bg">
              <HugeiconsIcon icon={Calendar01Icon} />
              Fecha… <span className="hidden [@media(hover:hover)]:inline">(D)</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              onSelect={(date) => {
                // format(), no toISOString().slice(0,10) — mismo bug de
                // huso horario que B-07 en date-utils.ts.
                const isoDate = date ? format(date, 'yyyy-MM-dd') : null
                const label = isoDate ? formatShortDate(isoDate) : 'sin fecha'
                confirmWithUndo(
                  `${taskIds.length} tarea${taskIds.length === 1 ? '' : 's'} → ${label}.`,
                  () => bulkMutation.mutate({ taskIds, fields: { due_date: isoDate } }),
                )
              }}
            />
          </PopoverContent>
        </Popover>

        {/* Antes no había Escape, ni botón, ni clic al vacío para cerrar
            esta barra — una vez tocado J/K quedaba para siempre (B-03).
            Escape ya limpia (useNodeViewController.ts); este botón cubre
            mouse/táctil. */}
        <Button variant="ghost" size="icon-sm" aria-label="Limpiar selección" onClick={onClear}>
          <HugeiconsIcon icon={MultiplicationSignIcon} />
        </Button>
      </div>
    </div>
  )
}
