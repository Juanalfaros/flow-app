import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  icon: IconSvgElement
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

// Plan de corrección de layout (2026-09-24), Corrección 3: ya no es una
// tarjeta con borde/fondo/sombra propios — <main> (AppShell.tsx) es la
// única caja de la columna de contenido, así que esto era una caja
// dentro de la caja. Se queda como sección con título; el `gap-6` del
// contenedor que use varias de estas (HomeDashboard/MyTasksPage/
// ReportsPage) es lo que separa una de otra, no un borde.
export function SectionCard({ icon, title, action, children, className }: SectionCardProps) {
  return (
    <section className={cn(className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={icon} className="size-4 text-text-muted" />
          <h2 className="text-sm font-medium">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
