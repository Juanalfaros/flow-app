import { HugeiconsIcon } from '@hugeicons/react'
import { CloudCheckIcon, WifiOff01Icon, Loading02Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { useConnectionStatus } from '@/lib/offline-queue'
import { cn } from '@/lib/utils'

export function ConnectionStatusIndicator() {
  const { isOnline, pendingCount, isSyncing } = useConnectionStatus()

  // El texto (largo variable, ej. "Sin conexión · 12 pendientes") corre el
  // resto del topbar en mobile — ahí se muestra solo el ícono/badge y el
  // detalle queda en el `title` nativo; desde sm: se ve la etiqueta completa.
  if (isOnline && pendingCount === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-text-muted" title="Sincronizado">
        <HugeiconsIcon icon={CloudCheckIcon} className="size-3.5 text-success" />
        <span className="hidden sm:inline">Sincronizado</span>
      </span>
    )
  }

  if (!isOnline) {
    const label = `Sin conexión${pendingCount > 0 ? ` · ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}` : ''}`
    return (
      <Badge variant="outline" className="border-warn text-warn" title={label}>
        <HugeiconsIcon icon={WifiOff01Icon} className="size-3.5" />
        <span className="hidden sm:inline">{label}</span>
      </Badge>
    )
  }

  const label = isSyncing ? 'Sincronizando…' : `${pendingCount} pendientes`
  return (
    <Badge variant="outline" className="border-accent text-accent" title={label}>
      <HugeiconsIcon
        icon={Loading02Icon}
        className={cn('size-3.5', isSyncing && 'animate-spin')}
      />
      <span className="hidden sm:inline">{label}</span>
    </Badge>
  )
}
