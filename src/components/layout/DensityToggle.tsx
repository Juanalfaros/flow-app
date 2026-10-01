import { HugeiconsIcon } from '@hugeicons/react'
import { ExpandParagraphIcon, ReduceParagraphIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { setDensity, useDensity } from '@/lib/density'

// Ícono solo + tooltip, no ícono+texto — auditoría del toolbar (el usuario
// marcó que Board/Lista mezclaban ícono+texto e ícono solo sin ningún
// criterio). Densidad se toca seguido pero no necesita leerse siempre: el
// tooltip alcanza, igual que el resto del toolbar reorganizado
// (ProjectToolbar.tsx).
export function DensityToggle() {
  const density = useDensity()
  const next = density === 'compact' ? 'Cómodo' : 'Compacto'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={`Densidad: ${density === 'compact' ? 'Compacto' : 'Cómodo'} — cambiar a ${next}`}
          onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        >
          <HugeiconsIcon icon={density === 'compact' ? ExpandParagraphIcon : ReduceParagraphIcon} className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Densidad: {density === 'compact' ? 'Compacto' : 'Cómodo'}</TooltipContent>
    </Tooltip>
  )
}
