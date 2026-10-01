import { HugeiconsIcon } from '@hugeicons/react'
import { HelpCircleIcon } from '@hugeicons/core-free-icons'
import type { ModuleId } from '@/components/layout/sidebar/modules'
import { ALL_MODULES } from '@/components/layout/sidebar/modules'
import { InicioPanel } from '@/components/layout/sidebar/panels/InicioPanel'
import { BandejaPanel } from '@/components/layout/sidebar/panels/BandejaPanel'
import { MisTareasPanel } from '@/components/layout/sidebar/panels/MisTareasPanel'
import { EspaciosPanel } from '@/components/layout/sidebar/panels/EspaciosPanel'
import { VistasGlobalesPanel } from '@/components/layout/sidebar/panels/VistasGlobalesPanel'
import { EquipoPanel } from '@/components/layout/sidebar/panels/EquipoPanel'
import { AjustesPanel } from '@/components/layout/sidebar/panels/AjustesPanel'

function panelBody(moduleId: ModuleId, onNavigate?: () => void) {
  switch (moduleId) {
    case 'inicio':
      return <InicioPanel onNavigate={onNavigate} />
    case 'bandeja':
      return <BandejaPanel onNavigate={onNavigate} />
    case 'tareas':
      return <MisTareasPanel onNavigate={onNavigate} />
    case 'espacios':
      return <EspaciosPanel onNavigate={onNavigate} />
    case 'vistas':
      return <VistasGlobalesPanel onNavigate={onNavigate} />
    case 'equipo':
      return <EquipoPanel onNavigate={onNavigate} />
    case 'ajustes':
      return <AjustesPanel onNavigate={onNavigate} />
  }
}

interface SidebarPanelProps {
  moduleId: ModuleId
  onNavigate?: () => void
  /** Se omite dentro del flyout (mismo contenido, sin repetir "Ayuda y
   * atajos" ni el título — el flyout ya trae su propia cabecera chica). */
  withChrome?: boolean
  onOpenShortcuts?: () => void
}

// Cabecera (título del módulo) + cuerpo scrolleable + pie ("Ayuda y
// atajos") — mismas 3 zonas fijas que ya tenía Sidebar.tsx antes del
// rediseño, ahora por módulo en vez de una sola vez para todo el <nav>.
export function SidebarPanel({ moduleId, onNavigate, withChrome = true, onOpenShortcuts }: SidebarPanelProps) {
  const label = ALL_MODULES.find((m) => m.id === moduleId)?.label ?? ''

  return (
    // `flex-1`, no `h-full`. Los dos llenan igual el panel fijo del
    // escritorio (su contenedor es un flex column con alto definido), pero
    // dentro del flyout —que ahora es `max-h` y sin alto propio— un
    // `height: 100%` depende de cómo resuelva el navegador un porcentaje
    // contra un alto indefinido. `flex-1` no tiene esa ambigüedad: sin
    // espacio libre que repartir se queda del tamaño de su contenido, que
    // es justo lo que hace que el flyout se adapte.
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      {withChrome && (
        <div className="flex min-h-[26px] shrink-0 items-center gap-2">
          <span className="flex-1 truncate text-sm font-semibold">{label}</span>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden no-scrollbar">
        {panelBody(moduleId, onNavigate)}
      </div>
      {withChrome && onOpenShortcuts && (
        <div className="shrink-0 border-t border-border pt-2">
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text transition-colors hover:bg-surface-alt"
          >
            <HugeiconsIcon icon={HelpCircleIcon} className="size-4 shrink-0" />
            Ayuda y atajos
          </button>
        </div>
      )}
    </div>
  )
}
