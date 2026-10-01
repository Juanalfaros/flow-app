import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface IconFilterOption {
  value: string
  /** Ya compuesto (ej. dot de color + texto) — cada caller arma su propio
   * children en vez de que este componente conozca sobre labels/prioridad. */
  label: ReactNode
}

interface IconFilterDropdownProps {
  icon: IconSvgElement
  /** Tooltip y aria-label — incluye el valor actual para no perder esa
   * información al pasar de pill-con-texto a ícono solo. */
  tooltip: string
  value: string
  options: IconFilterOption[]
  onChange: (value: string) => void
  /** Resalta el botón (mismo criterio que antes: `border-accent/50
   * bg-accent-soft`) cuando el filtro no está en su valor "todos/default". */
  active?: boolean
}

// Reemplaza los `Select` con label visible de FilterBar/ProjectToolbar por
// un ícono compacto + popover de opciones (radio, una sola selección) —
// mismo patrón visual que ClickUp. El valor actual se comunica por color
// (active) y tooltip, no por texto en el botón.
export function IconFilterDropdown({ icon, tooltip, value, options, onChange, active }: IconFilterDropdownProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={tooltip}
              className={cn(active && 'border-accent/50 bg-accent-soft text-accent')}
            >
              <HugeiconsIcon icon={icon} className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
