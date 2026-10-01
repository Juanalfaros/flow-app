import { HugeiconsIcon } from '@hugeicons/react'
import { MultiplicationSignIcon } from '@hugeicons/core-free-icons'
import { useLabels } from '@/features/labels/queries'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { PRIORITY_LABEL } from '@/features/tasks/priority'
import type { TaskFilters } from '@/features/projects/components/FilterBar'

interface ActiveFilterChipsProps {
  workspaceId: string
  filters: TaskFilters
  searchQuery: string
  onFiltersChange: (filters: TaskFilters) => void
  onSearchQueryChange: (query: string) => void
}

// Los íconos del toolbar (FilterBar/SearchPopover) comunican el valor
// elegido por color+tooltip — invisible al volver a un proyecto al día
// siguiente con filtros de ayer puestos (F-03). Esta fila de chips, debajo
// del toolbar y sólo presente cuando hay algo activo, hace que "Limpiar
// filtros" deje de ser necesario para entender por qué faltan tareas.
export function ActiveFilterChips({
  workspaceId,
  filters,
  searchQuery,
  onFiltersChange,
  onSearchQueryChange,
}: ActiveFilterChipsProps) {
  const { data: labels } = useLabels(workspaceId)
  const { data: members } = useWorkspaceMembers(workspaceId)

  const chips: { key: string; label: string; onRemove: () => void }[] = []

  if (filters.labelId) {
    const label = labels?.find((l) => l.id === filters.labelId)
    chips.push({
      key: 'label',
      label: `Etiqueta: ${label?.name ?? '…'}`,
      onRemove: () => onFiltersChange({ ...filters, labelId: undefined }),
    })
  }
  if (filters.assigneeIds?.length) {
    const ids = filters.assigneeIds
    const names = members?.filter((m) => ids.includes(m.user_id)).map((m) => m.profile?.full_name ?? m.user_id)
    chips.push({
      key: 'assignee',
      label: `Asignado: ${(names?.length ? names : ids).join(', ')}`,
      onRemove: () => onFiltersChange({ ...filters, assigneeIds: undefined }),
    })
  }
  if (filters.priority) {
    chips.push({
      key: 'priority',
      label: `Prioridad: ${PRIORITY_LABEL[filters.priority] ?? filters.priority}`,
      onRemove: () => onFiltersChange({ ...filters, priority: undefined }),
    })
  }
  if (searchQuery) {
    chips.push({ key: 'search', label: `"${searchQuery}"`, onRemove: () => onSearchQueryChange('') })
  }

  if (chips.length === 0) return null

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="flex items-center gap-1 rounded-full bg-surface-alt py-1 pr-1.5 pl-2.5 text-xs font-medium text-text-secondary"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Quitar filtro: ${chip.label}`}
            onClick={chip.onRemove}
            className="rounded-full p-0.5 text-text-muted hover:bg-border hover:text-text"
          >
            <HugeiconsIcon icon={MultiplicationSignIcon} className="size-2.5" />
          </button>
        </span>
      ))}
    </div>
  )
}
