import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useTasks } from '@/features/tasks/queries'

interface TaskDependencyPickerProps {
  containerId: string
  /** La propia tarea + lo que ya está en esta lista (el otro extremo de
   *  cada dependencia existente en esta dirección) — ninguno de los dos
   *  tiene sentido ofrecer de nuevo. */
  excludeIds: string[]
  onSelect: (taskId: string) => void
}

const MAX_RESULTS = 30

/**
 * Buscador de tareas del MISMO proyecto para enlazar como dependencia —
 * mismo molde visual que LabelPicker (Popover + trigger "+" circular
 * punteado), pero con texto libre en vez de una lista chica de checkboxes:
 * un proyecto puede tener cientos de tareas, a diferencia de la paleta
 * acotada de etiquetas del workspace.
 */
export function TaskDependencyPicker({ containerId, excludeIds, onSelect }: TaskDependencyPickerProps) {
  const { data: tasks } = useTasks(containerId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const excluded = new Set(excludeIds)
  const normalizedQuery = query.trim().toLowerCase()
  const results = (tasks ?? [])
    .filter((t) => !excluded.has(t.id))
    .filter((t) => (normalizedQuery ? t.title.toLowerCase().includes(normalizedQuery) : true))
    .slice(0, MAX_RESULTS)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Agregar dependencia"
          title="Agregar dependencia"
          // `after:` agranda el área de toque de 24px a 40px sin
          // agrandar el círculo visible — mismo criterio que Checkbox
          // (ui/checkbox.tsx). Auditoría mobile.
          className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-text-muted after:absolute after:-inset-2 hover:border-accent hover:text-accent"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tarea del proyecto…"
          className="mb-1.5 h-7 text-xs"
        />
        <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
          {results.length === 0 && (
            <p className="p-1 text-xs text-text-muted">
              {tasks?.length ? 'Sin resultados.' : 'Sin otras tareas en este proyecto.'}
            </p>
          )}
          {results.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelect(t.id)
                setOpen(false)
                setQuery('')
              }}
              className="truncate rounded px-1.5 py-1 text-left text-xs hover:bg-surface-alt"
            >
              {t.title}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
