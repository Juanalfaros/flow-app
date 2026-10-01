import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { FilterIcon, FilterRemoveIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLabels } from '@/features/labels/queries'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { PRIORITIES, PRIORITY_DOT, PRIORITY_LABEL } from '@/features/tasks/priority'
import type { TaskSort } from '@/features/nodes/useNodeViewController'
import { cn } from '@/lib/utils'

export interface TaskFilters {
  labelId?: string
  // Coincide con CUALQUIERA de los seleccionados (OR), no con todos —
  // task_assignees es la fuente de verdad desde 0041_task_assignees.sql,
  // ya no el `assignee_id` (responsable principal) escalar.
  assigneeIds?: string[]
  priority?: string
  // No son predicados de `applyTaskFilters` — `sort` lo consume `sortTasks`
  // y `q` lo consume el filtrado por título de cada ruta (ver
  // useNodeViewController.ts / useProjectViewSearch.ts). Viven acá igual
  // porque `TaskFilters` es el único objeto sincronizado con la URL que ya
  // fluye por ProjectPageHeader/las rutas; un tipo paralelo por campo no
  // aportaría nada.
  sort?: TaskSort
  // Mismo criterio que `sort`: no es un predicado de inclusión (no filtra
  // ninguna tarea), es cómo se organizan en columnas/secciones — ver
  // GroupByPicker.tsx / useNodeViewController.ts (encodeGroupBy/
  // decodeGroupBy). Ausente = 'status' (comportamiento de siempre).
  groupBy?: string
  // Búsqueda por título del toolbar — antes vivía en un `useState` local
  // por vista (se perdía al cambiar de vista, recargar o compartir un
  // enlace). Ver useProjectViewSearch.ts.
  q?: string
}

// Sólo estos 3 campos cuentan como "filtro" para el ícono de limpiar y el
// estado vacío consciente del filtro (F-02) — `sort` y `q` son conceptos
// aparte (orden y búsqueda, no un predicado de inclusión/exclusión).
export function hasActiveTaskFilters(filters: TaskFilters): boolean {
  return !!(filters.labelId || filters.assigneeIds?.length || filters.priority)
}

interface FilterBarProps {
  workspaceId: string
  filters: TaskFilters
  onChange: (filters: TaskFilters) => void
}

// Un solo botón "Filtros" con un popover de 3 secciones, no 3 íconos
// sueltos (Etiqueta/Asignado/Prioridad) — auditoría del toolbar: el ícono
// de tag de "filtrar por etiqueta" era indistinguible a simple vista del
// botón "Etiquetas" (gestión del workspace, ProjectToolbar.tsx/
// MoreActionsMenu.tsx), mismo ícono repetido sin texto que lo distinguiera.
// Consolidar en un solo trigger de paso baja de 3 controles a 1. El valor
// actual ya no cabe en un tooltip (pueden estar los 3 filtros puestos a la
// vez) — lo comunican los chips de ActiveFilterChips.tsx, no este botón.
export function FilterBar({ workspaceId, filters, onChange }: FilterBarProps) {
  const { data: labels } = useLabels(workspaceId)
  const { data: members } = useWorkspaceMembers(workspaceId)
  const assigneeIds = filters.assigneeIds ?? []
  const hasFilters = hasActiveTaskFilters(filters)

  function toggleAssignee(userId: string, checked: boolean) {
    const next = checked ? [...assigneeIds, userId] : assigneeIds.filter((id) => id !== userId)
    onChange({ ...filters, assigneeIds: next.length > 0 ? next : undefined })
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Filtros"
              className={cn(hasFilters && 'border-accent/50 bg-accent-soft text-accent')}
            >
              <HugeiconsIcon icon={FilterIcon} className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Filtros</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="max-h-80 overflow-y-auto p-1.5">
          <FilterGroup label="Etiqueta">
            {(labels ?? []).length === 0 && <p className="px-1.5 py-1 text-xs text-text-muted">Sin etiquetas todavía.</p>}
            {(labels ?? []).map((l) => (
              <FilterOption
                key={l.id}
                active={filters.labelId === l.id}
                onClick={() => onChange({ ...filters, labelId: filters.labelId === l.id ? undefined : l.id })}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: l.color ?? undefined }} />
                {l.name}
              </FilterOption>
            ))}
          </FilterGroup>

          <FilterGroup label="Asignado">
            {(members ?? []).map((m) => (
              <label
                key={m.user_id}
                className="flex cursor-default items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-surface-alt"
              >
                <Checkbox
                  checked={assigneeIds.includes(m.user_id)}
                  onCheckedChange={(checked) => toggleAssignee(m.user_id, checked === true)}
                />
                {m.profile?.full_name ?? m.user_id}
              </label>
            ))}
          </FilterGroup>

          <FilterGroup label="Prioridad">
            {PRIORITIES.map((p) => (
              <FilterOption
                key={p}
                active={filters.priority === p}
                onClick={() => onChange({ ...filters, priority: filters.priority === p ? undefined : p })}
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', PRIORITY_DOT[p])} />
                {PRIORITY_LABEL[p]}
              </FilterOption>
            ))}
          </FilterGroup>
        </div>

        {hasFilters && (
          <div className="border-t border-border p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              // Campos explícitos en `undefined`, no `{}`: la navegación
              // ahora es `search: (prev) => ({ ...prev, ...next })` en las 4
              // vistas (ver useProjectViewSearch.ts) — un objeto vacío ya no
              // borra nada, hay que decir explícitamente qué apagar. `sort`/
              // `q` quedan afuera a propósito: no son "filtros".
              onClick={() => onChange({ ...filters, labelId: undefined, assigneeIds: undefined, priority: undefined })}
            >
              <HugeiconsIcon icon={FilterRemoveIcon} />
              Limpiar filtros
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="px-1.5 py-1 font-mono text-[10px] font-semibold tracking-wide text-text-muted uppercase">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function FilterOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-surface-alt',
        active && 'bg-accent-soft text-accent',
      )}
    >
      {children}
    </button>
  )
}

export function applyTaskFilters<
  T extends {
    priority: string
    task_labels: { label: { id: string } }[]
    task_assignees: { user_id: string }[]
  },
>(tasks: T[], filters: TaskFilters): T[] {
  return tasks.filter((t) => {
    if (
      filters.assigneeIds?.length &&
      !t.task_assignees.some((a) => filters.assigneeIds!.includes(a.user_id))
    )
      return false
    if (filters.priority && t.priority !== filters.priority) return false
    if (filters.labelId && !t.task_labels.some((tl) => tl.label.id === filters.labelId)) return false
    return true
  })
}
