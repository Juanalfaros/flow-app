import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface SearchPopoverProps {
  query: string
  onQueryChange: (query: string) => void
}

// Ícono solo (sin input siempre visible) — el input aparece en un popover
// al hacer click, mismo criterio compacto que el resto del toolbar.
export function SearchPopover({ query, onQueryChange }: SearchPopoverProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Buscar en esta vista"
              className={cn(query && 'border-accent/50 bg-accent-soft text-accent')}
            >
              <HugeiconsIcon icon={Search01Icon} className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Buscar en esta vista</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-56 p-1.5">
        <Input
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar en esta vista…"
          className="h-8"
        />
      </PopoverContent>
    </Popover>
  )
}
