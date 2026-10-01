import { useState } from 'react'
import { Sorting05Icon } from '@hugeicons/core-free-icons'
import { DensityToggle } from '@/components/layout/DensityToggle'
import { GroupByPicker } from '@/features/projects/components/GroupByPicker'
import { IconFilterDropdown } from '@/features/projects/components/IconFilterDropdown'
import { MyTasksToggle } from '@/features/projects/components/MyTasksToggle'
import { SearchPopover } from '@/features/projects/components/SearchPopover'
import { ViewSettingsPopover } from '@/features/projects/components/ViewSettingsPopover'
import { MoreActionsMenu } from '@/features/projects/components/MoreActionsMenu'
import { ActiveFilterChips } from '@/features/projects/components/ActiveFilterChips'
import { FilterBar, hasActiveTaskFilters, type TaskFilters } from '@/features/projects/components/FilterBar'
import { CreateTaskButton } from '@/features/tasks/components/CreateTaskButton'
import { ImportTasksDialog } from '@/features/tasks/components/ImportTasksDialog'
import type { TaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'
import type { TaskSort } from '@/features/nodes/useNodeViewController'

const SORT_LABEL: Record<TaskSort, string> = {
  manual: 'Manual',
  dueDate: 'Fecha de vencimiento',
  priority: 'Prioridad',
  createdAt: 'Fecha de creación',
}

interface ProjectToolbarProps {
  projectId: string
  workspaceId: string
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  createStatusId: string | undefined
  /** Solo list.tsx: campos por columna no aplican al Tablero (tarjetas, no columnas). */
  showViewSettings?: boolean
  /** Board/Lista: agrupar en columnas/secciones — ausente en Gantt/
   * Calendario/Tabla (no tienen columnas/secciones que agrupar). Los dos
   * viajan juntos: sin `onGroupByChange` no se monta el ícono, da igual lo
   * que traiga `groupBy`. */
  groupBy?: string
  onGroupByChange?: (value: string | undefined) => void
  /** F5 #4 (CSV): las tres solo se pasan cuando la vista que llama tiene
   * lista de tareas propia (list.tsx/board.tsx) — sin ellas el ítem de
   * exportar no aparece en el menú "⋯", en vez de exportar un array
   * vacío. `exportTasks` es lo que la vista ya está mostrando (filtrado/
   * ordenado), no un dump completo del proyecto. */
  exportTasks?: TaskSummary[]
  exportStatuses?: StatusSummary[]
  projectName?: string
}

// Una sola fila, agrupada por frecuencia de uso (auditoría del toolbar,
// reportada por el usuario con captura: antes mezclaba ícono+texto e
// ícono solo sin ningún criterio, y "Etiquetas"/"Estados"/"Campos
// personalizados" — configuración de la lista, se tocan una vez cada
// tanto — competían visualmente con Agrupar/Filtrar/Ordenar/Buscar, que sí
// se usan en cada sesión). Ahora: Densidad/Agrupar/Filtros/Ordenar/Mis
// tareas/Buscar quedan en la fila (ícono + tooltip, ninguno con texto
// salvo Crear Tarea); Etiquetas/Estados/Campos personalizados/Exportar/
// Importar se mudan al menú "⋯" (MoreActionsMenu.tsx). Los filtros
// activos se muestran debajo como chips removibles (ActiveFilterChips) en
// vez de un simple contador — la fila vuelve a decir QUÉ se está viendo,
// no solo cuántos filtros hay puestos — y solo ocupan espacio cuando hay
// algo activo, nunca una fila permanente.
export function ProjectToolbar({
  projectId,
  workspaceId,
  filters,
  onFiltersChange,
  searchQuery,
  onSearchQueryChange,
  createStatusId,
  showViewSettings,
  groupBy,
  onGroupByChange,
  exportTasks,
  exportStatuses,
  projectName,
}: ProjectToolbarProps) {
  const sort = filters.sort ?? 'manual'
  const [importOpen, setImportOpen] = useState(false)

  return (
    <>
      {/* En mobile esta fila NO envuelve: scrollea en su propio eje
          horizontal. Con `flex-wrap`, los 8 controles se apilaban en 2-3
          líneas en 390px — sumadas al breadcrumb, el nombre y las tabs de
          vista, había que bajar 3 pantallazos de chrome antes de ver la
          primera tarea (medido contra el prototipo, que deja 3 chips). Con
          Densidad, Campos por columna y "+ Tarea" fuera del camino en
          mobile (ver abajo) los 6 que quedan entran en una sola fila sin
          necesidad de scrollear; el `overflow-x-auto` está por si alguno
          crece. Desde md: vuelve a envolver como siempre. */}
      <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-x-visible">
        {/* Densidad (Compacto/Cómodo) y Campos por columna son ajustes de
            una tabla ancha: en una pantalla donde TaskRow ya muestra solo
            checkbox + título + estado no cambian nada visible. */}
        <div className="hidden md:contents">
          <DensityToggle />
          {showViewSettings && <ViewSettingsPopover projectId={projectId} />}
        </div>
        {onGroupByChange && <GroupByPicker projectId={projectId} value={groupBy} onChange={onGroupByChange} />}

        <FilterBar workspaceId={workspaceId} filters={filters} onChange={onFiltersChange} />
        <IconFilterDropdown
          icon={Sorting05Icon}
          tooltip={`Ordenar: ${SORT_LABEL[sort]}`}
          active={sort !== 'manual'}
          value={sort}
          onChange={(v) => onFiltersChange({ ...filters, sort: v === 'manual' ? undefined : (v as TaskSort) })}
          options={(Object.keys(SORT_LABEL) as TaskSort[]).map((s) => ({ value: s, label: SORT_LABEL[s] }))}
        />
        <MyTasksToggle workspaceId={workspaceId} filters={filters} onChange={onFiltersChange} />
        <SearchPopover query={searchQuery} onQueryChange={onSearchQueryChange} />

        <MoreActionsMenu
          projectId={projectId}
          workspaceId={workspaceId}
          exportTasks={exportTasks}
          exportStatuses={exportStatuses}
          projectName={projectName}
          onImportClick={() => setImportOpen(true)}
        />

        {/* ml-auto: separa visualmente el CTA principal del resto de la
            fila (misma esquina donde ya estaba) — sin forzarlo a una fila
            propia cuando el resto envuelve en mobile.
            `hidden md:block`: en mobile crear una tarea es el botón
            flotante sobre la tab bar (MobileQuickCreate.tsx), que además
            llega desde cualquier pantalla y no solo desde acá — dejar los
            dos duplicaba el CTA principal en la pantalla más angosta. */}
        <div className="ml-auto hidden md:block">
          <CreateTaskButton projectId={projectId} statusId={createStatusId} />
        </div>
      </div>

      {(hasActiveTaskFilters(filters) || searchQuery) && (
        <ActiveFilterChips
          workspaceId={workspaceId}
          filters={filters}
          searchQuery={searchQuery}
          onFiltersChange={onFiltersChange}
          onSearchQueryChange={onSearchQueryChange}
        />
      )}

      {importOpen && (
        <ImportTasksDialog projectId={projectId} workspaceId={workspaceId} open={importOpen} onOpenChange={setImportOpen} />
      )}
    </>
  )
}
