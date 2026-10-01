import { useActiveModule } from '@/components/layout/sidebar/use-active-module'
import { SidebarRail } from '@/components/layout/sidebar/SidebarRail'
import { SidebarPanel } from '@/components/layout/sidebar/SidebarPanel'
import { useSidebarPanelOpen } from '@/lib/sidebar-state'

interface SidebarProps {
  /** Cierra un flyout de módulo colapsado al navegar. */
  onNavigate?: () => void
  /** Si se pasa, agrega el atajo "Buscar" que abre el command palette. */
  onOpenPalette?: () => void
  /** Si se pasa, "Ayuda y atajos" abre el diálogo real. */
  onOpenShortcuts?: () => void
}

// Rediseño de navegación: riel de módulos + panel de contexto como dos
// paneles flotantes separados (antes: un solo <nav> con todo apilado). El
// módulo activo se deriva de la ruta actual por defecto y es
// clickeable/pisable a mano sin navegar — ver use-active-module.ts. El
// colapso a "solo riel" sigue siendo el mismo booleano persistido de
// siempre (`panelOpen` en sidebar-state.ts): cuando está colapsado, el panel
// desaparece y cada módulo se abre como flyout anclado a su ícono
// (SidebarRail.tsx), en vez de una columna de íconos de proyecto como
// hacía la versión vieja.
//
// Solo la instancia de escritorio (montada en AppShell.tsx bajo `md:`) usa
// este componente — en móvil la navegación es la tab bar fija
// (MobileTabBar.tsx), que reusa SidebarPanel directo para su hoja "Más" en
// vez de este composer.
export function Sidebar({ onNavigate, onOpenPalette, onOpenShortcuts }: SidebarProps) {
  const { activeModule, selectModule } = useActiveModule()
  const panelOpen = useSidebarPanelOpen()

  return (
    <div className="flex h-full shrink-0 gap-1.5">
      <SidebarRail
        activeModule={activeModule}
        onSelectModule={selectModule}
        collapsed={!panelOpen}
        onNavigate={onNavigate}
        onOpenPalette={onOpenPalette}
      />
      {panelOpen && (
        <div className="dark-scope flex h-full w-[228px] shrink-0 flex-col overflow-hidden rounded-panel border border-border bg-surface text-text shadow-panel">
          <SidebarPanel
            moduleId={activeModule}
            onNavigate={onNavigate}
            onOpenShortcuts={onOpenShortcuts}
          />
        </div>
      )}
    </div>
  )
}
