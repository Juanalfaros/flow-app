import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { AlignLeftIcon, Calendar01Icon, Flag01Icon, UserIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useListFieldVisibility, toggleListField, type ListFieldVisibility } from '@/features/nodes/list-fields'
import { cn } from '@/lib/utils'

const FIELD_META: { key: keyof ListFieldVisibility; icon: IconSvgElement; label: string }[] = [
  { key: 'description', icon: AlignLeftIcon, label: 'Descripción' },
  { key: 'assignee', icon: UserIcon, label: 'Asignado' },
  { key: 'priority', icon: Flag01Icon, label: 'Prioridad' },
  { key: 'dueDate', icon: Calendar01Icon, label: 'Fecha límite' },
]

interface FieldVisibilityTogglesProps {
  projectId: string
}

// Oculto por default, visible en hover del contenedor padre (el caller
// debe envolver esto en un elemento con className="group") y en foco de
// teclado (focus-within) — hover-only sería un hueco de accesibilidad real.
// Se renderiza en las 4 vistas (ProjectPageHeader) para que esa fila del
// header sea idéntica sin importar la vista activa — pero el estado que
// controla (list-fields.ts) hoy solo lo lee TaskRow, así que en
// Board/Calendario/Gantt el control existe pero todavía no tiene efecto
// visible. Si se quiere que también oculte campos ahí, hay que sumar la
// lectura de useListFieldVisibility en TaskCard/CalendarTaskChip/GanttRow.
export function FieldVisibilityToggles({ projectId }: FieldVisibilityTogglesProps) {
  const visibility = useListFieldVisibility(projectId)

  return (
    // `[@media(hover:none)]:hidden` (R-04): en táctil no existe el hover, así
    // que estos botones quedaban en `opacity-0` PERO seguían ocupando su
    // espacio y respondiendo al toque — tocar cerca del nombre del proyecto
    // podía ocultar una columna sin que apareciera nada que lo explicara.
    // El popover de Ajustes de vista (ViewSettingsPopover) ya ofrece lo
    // mismo de forma descubrible, así que en táctil basta con eso.
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden">
      {FIELD_META.map(({ key, icon, label }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={visibility[key]}
              aria-label={`${visibility[key] ? 'Ocultar' : 'Mostrar'} columna ${label}`}
              onClick={() => toggleListField(projectId, key)}
            >
              <HugeiconsIcon icon={icon} className={cn('size-3.5', visibility[key] ? 'text-accent' : 'text-text-muted/50')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
