import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { AlignLeftIcon, Calendar01Icon, ColumnsThreeCogIcon, Flag01Icon, UserIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useListFieldVisibility, toggleListField, type ListFieldVisibility } from '@/features/nodes/list-fields'
import { cn } from '@/lib/utils'

const FIELD_META: { key: keyof ListFieldVisibility; icon: IconSvgElement; label: string }[] = [
  { key: 'description', icon: AlignLeftIcon, label: 'Descripción' },
  { key: 'assignee', icon: UserIcon, label: 'Asignado' },
  { key: 'priority', icon: Flag01Icon, label: 'Prioridad' },
  { key: 'dueDate', icon: Calendar01Icon, label: 'Fecha límite' },
]

interface ViewSettingsPopoverProps {
  projectId: string
}

// Solo vista Lista. Alternativa descubrible a los íconos hover-only junto
// al breadcrumb (FieldVisibilityToggles) — lee/escribe el mismo
// list-fields.ts, así que ambas superficies quedan siempre sincronizadas.
// La densidad ya no vive acá: es un botón visible aparte en el toolbar
// (`leftActions`, ver board.tsx/list.tsx) — tenerla acá también sería
// un control duplicado.
export function ViewSettingsPopover({ projectId }: ViewSettingsPopoverProps) {
  const visibility = useListFieldVisibility(projectId)

  return (
    <Popover>
      {/* ColumnsThreeCogIcon, no Settings02Icon: ese mismo engranaje ya lo
          usan "Etiquetas"/"Estados" (botones CON texto) — acá el trigger
          no tiene texto, solo aria-label, así que compartir el mismo
          ícono con esos dos era el mismo problema de fondo que "Etiquetas"
          vs. el filtro por etiqueta (reportado por el usuario). */}
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Ajustes de vista">
          <HugeiconsIcon icon={ColumnsThreeCogIcon} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex flex-col gap-0.5">
          <span className="px-1 text-xs font-medium text-text-muted uppercase">Columnas</span>
          {FIELD_META.map(({ key, icon, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={visibility[key]}
              onClick={() => toggleListField(projectId, key)}
              className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-surface-alt"
            >
              <HugeiconsIcon icon={icon} className={cn('size-4', visibility[key] ? 'text-accent' : 'text-text-muted')} />
              <span className="flex-1 text-left">{label}</span>
              <span
                className={cn(
                  'size-3.5 rounded-full border',
                  visibility[key] ? 'border-accent bg-accent' : 'border-border bg-transparent',
                )}
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
