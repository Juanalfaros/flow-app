import { TASK_SORTS, type TaskSort } from '@/features/nodes/useNodeViewController'
import type { TaskFilters } from '@/features/projects/components/FilterBar'

// Antes cada una de las 4 vistas de proyecto (Lista/Board/Gantt/Calendario)
// escribía su propio `validateSearch` casi idéntico, y su propio
// `onFiltersChange` — dos de las tres formas de navegar (`search: next`) le
// pasaban a TanStack Router un objeto que REEMPLAZA toda la query string en
// vez de mezclarla, así que "Limpiar filtros" de paso borraba `sort` (y en
// Calendario, con la forma correcta `{ ...prev, ...next }`, un objeto vacío
// no cambiaba nada — el botón no hacía nada ahí). Un solo lugar para las dos
// mitades (parseo + navegación) evita que las 4 vistas vuelvan a divergir.
export function parseTaskFiltersSearch(search: Record<string, unknown>): TaskFilters {
  return {
    labelId: typeof search.labelId === 'string' ? search.labelId : undefined,
    assigneeIds: Array.isArray(search.assigneeIds)
      ? search.assigneeIds.filter((v): v is string => typeof v === 'string')
      : undefined,
    priority: typeof search.priority === 'string' ? search.priority : undefined,
    sort: TASK_SORTS.includes(search.sort as TaskSort) ? (search.sort as TaskSort) : undefined,
    groupBy: typeof search.groupBy === 'string' ? search.groupBy : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }
}

interface UseProjectViewSearchResult<S extends TaskFilters> {
  filters: S
  onFiltersChange: (next: TaskFilters) => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
}

// `search`/`navigate` son los que devuelve `Route.useSearch()`/
// `Route.useNavigate()` de cada ruta — se pasan tal cual, este hook no
// conoce la ruta concreta, sólo la forma mínima que necesita
// (`TaskFilters` + `q`). `S` generic (no `TaskFilters & { q?: string }`
// fijo) para que Calendario pueda seguir agregando `range`/`date` a su
// propio tipo de búsqueda sin perder la unión con el resto.
export function useProjectViewSearch<S extends TaskFilters>(
  search: S,
  navigate: (opts: { search: (prev: S) => S }) => void,
): UseProjectViewSearchResult<S> {
  return {
    filters: search,
    onFiltersChange: (next) => navigate({ search: (prev) => ({ ...prev, ...next }) }),
    searchQuery: search.q ?? '',
    onSearchQueryChange: (q) => navigate({ search: (prev) => ({ ...prev, q: q.trim() ? q : undefined }) }),
  }
}
