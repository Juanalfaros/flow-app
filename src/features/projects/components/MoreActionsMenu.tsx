import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Download01Icon,
  ListSettingIcon,
  MoreHorizontalIcon,
  Settings02Icon,
  TagsIcon,
  Upload01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LabelPicker } from '@/features/labels/components/LabelPicker'
import { StatusSettingsDialog } from '@/features/projects/components/StatusSettingsDialog'
import { CustomFieldDefinitionDialog } from '@/features/custom-fields/components/CustomFieldDefinitionDialog'
import { exportTasksToCsv } from '@/features/tasks/csv-export'
import type { TaskSummary } from '@/features/tasks/queries'
import type { StatusSummary } from '@/features/projects/queries'

interface MoreActionsMenuProps {
  projectId: string
  workspaceId: string
  /** Igual criterio que antes en ProjectToolbar.tsx: sin `exportTasks` no
   * hay ítem de exportar (la vista que llama no tiene una lista de tareas
   * propia que exportar) — importar sí queda siempre disponible. */
  exportTasks?: TaskSummary[]
  exportStatuses?: StatusSummary[]
  projectName?: string
  onImportClick: () => void
}

// Auditoría del toolbar: "Etiquetas"/"Estados"/"Campos personalizados" son
// configuración de la lista — se tocan una vez cada tanto, no en cada
// sesión de trabajo — a diferencia de Agrupar/Filtrar/Ordenar/Buscar, que
// sí. Vivían sueltos en el toolbar con el mismo peso visual que esos
// cuatro; acá quedan juntos en un solo menú "⋯", con Exportar/Importar CSV
// (la otra pareja de acciones poco frecuentes). Cada ítem abre su propio
// diálogo/popover ya existente en modo controlado (`showTrigger={false}`)
// — este menú solo decide CUÁNDO abrirlos, no reimplementa nada de lo que
// ya hacían.
export function MoreActionsMenu({
  projectId,
  workspaceId,
  exportTasks,
  exportStatuses,
  projectName,
  onImportClick,
}: MoreActionsMenuProps) {
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Más opciones">
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Más opciones</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setLabelsOpen(true)}>
            <HugeiconsIcon icon={TagsIcon} />
            Etiquetas
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setStatusesOpen(true)}>
            <HugeiconsIcon icon={Settings02Icon} />
            Estados
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFieldsOpen(true)}>
            <HugeiconsIcon icon={ListSettingIcon} />
            Campos personalizados
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {exportTasks && (
            <DropdownMenuItem
              disabled={exportTasks.length === 0}
              onSelect={() => exportTasksToCsv(projectName ?? 'lista', exportTasks, exportStatuses ?? [])}
            >
              <HugeiconsIcon icon={Download01Icon} />
              Exportar a CSV
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={onImportClick}>
            <HugeiconsIcon icon={Upload01Icon} />
            Importar desde CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LabelPicker workspaceId={workspaceId} open={labelsOpen} onOpenChange={setLabelsOpen} showTrigger={false} />
      <StatusSettingsDialog projectId={projectId} open={statusesOpen} onOpenChange={setStatusesOpen} showTrigger={false} />
      <CustomFieldDefinitionDialog projectId={projectId} open={fieldsOpen} onOpenChange={setFieldsOpen} showTrigger={false} />
    </>
  )
}
