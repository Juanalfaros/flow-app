import { HugeiconsIcon } from '@hugeicons/react'
import type { NodeAppearance } from '@/features/nodes/types'
import { NODE_ICON_PRESET_MAP, DEFAULT_NODE_ICON } from '@/features/nodes/icon-presets'
import { cn } from '@/lib/utils'

const SIZE_CLASS = { sm: 'size-4 text-[9px]', md: 'size-10 text-sm' } as const
const ICON_SIZE_CLASS = { sm: 'size-2.5', md: 'size-5' } as const

interface NodeIconSwatchProps {
  name: string
  appearance: NodeAppearance | null
  size?: 'sm' | 'md'
  className?: string
}

// Mismo look que el avatar del workspace en Sidebar.tsx (bg-accent +
// inicial) cuando el nodo todavía no tiene appearance propia — no un
// tratamiento nuevo, uno que ya existe en el resto de la app.
export function NodeIconSwatch({ name, appearance, size = 'sm', className }: NodeIconSwatchProps) {
  const base = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md', SIZE_CLASS[size], className)

  if (appearance?.kind === 'image') {
    return (
      <span className={base}>
        <img src={appearance.imageUrl} alt="" className="size-full object-cover" />
      </span>
    )
  }

  if (appearance?.kind === 'preset') {
    const icon = NODE_ICON_PRESET_MAP.get(appearance.icon) ?? DEFAULT_NODE_ICON.icon
    return (
      <span className={base} style={{ backgroundColor: appearance.color }}>
        <HugeiconsIcon icon={icon} className={cn(ICON_SIZE_CLASS[size], 'text-white')} />
      </span>
    )
  }

  return (
    <span className={cn(base, 'bg-accent font-semibold text-accent-foreground')}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
