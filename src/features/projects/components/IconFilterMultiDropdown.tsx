import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface IconFilterMultiOption {
  value: string
  label: ReactNode
}

interface IconFilterMultiDropdownProps {
  icon: IconSvgElement
  tooltip: string
  values: string[]
  options: IconFilterMultiOption[]
  onChange: (values: string[]) => void
}

// Variante de selección múltiple de IconFilterDropdown.tsx (que usa un
// DropdownMenuRadioGroup, una sola opción a la vez) — mismo look, pero con
// DropdownMenuCheckboxItem para el filtro "Asignado", que ahora puede
// coincidir con cualquiera de varios responsables (task_assignees,
// 0041_task_assignees.sql) en vez de un único valor.
export function IconFilterMultiDropdown({ icon, tooltip, values, options, onChange }: IconFilterMultiDropdownProps) {
  function toggle(value: string, checked: boolean) {
    onChange(checked ? [...values, value] : values.filter((v) => v !== value))
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={tooltip}
              className={cn(values.length > 0 && 'border-accent/50 bg-accent-soft text-accent')}
            >
              <HugeiconsIcon icon={icon} className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={values.includes(option.value)}
            onCheckedChange={(checked) => toggle(option.value, checked === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
