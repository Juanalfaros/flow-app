import { useState, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from '@hugeicons/core-free-icons'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { MobileTabBar, useShowMobileTabBar } from '@/components/layout/MobileTabBar'
import { MobileQuickCreate } from '@/components/layout/MobileQuickCreate'
import { CommandPalette } from '@/features/command-palette/CommandPalette'
import { KeyboardShortcutsDialog } from '@/components/layout/KeyboardShortcutsDialog'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NodeDetailContent } from '@/features/tasks/components/NodeDetailContent'
import { PushPromptDialog } from '@/features/push/components/PushPromptDialog'
import { useSession } from '@/features/auth/queries'
import { useAppBadge } from '@/features/notifications/useAppBadge'
import { useTaskViewMode } from '@/features/nodes/task-view-mode'
import { useSidebarPanelOpen, setSidebarPanelOpen } from '@/lib/sidebar-state'
import { useShortcutsDialogOpen, setShortcutsDialogOpen } from '@/components/layout/shortcuts-dialog-state'
import { useModuleShortcuts } from '@/components/layout/sidebar/use-module-shortcuts'
import { useSyncWeekStart } from '@/features/profile/use-sync-week-start'
import { cn } from '@/lib/utils'

interface AppShellProps {
  children: ReactNode
  selectedNodeId: string | null
  onCloseNode: () => void
}

export function AppShell({ children, selectedNodeId, onCloseNode }: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const shortcutsOpen = useShortcutsDialogOpen()
  const showTabBar = useShowMobileTabBar()
  const mode = useTaskViewMode()
  const sidebarPanelOpen = useSidebarPanelOpen()
  const { data: session } = useSession()
  useAppBadge(session?.user.id)
  useModuleShortcuts()
  useSyncWeekStart(session?.user.id ?? '')

  // `mode === 'full'` no llega a setear `?node=` (ver los triggers de
  // apertura en TaskCard/TaskRow/DraggableTaskCard/CommandPalette) — así
  // que acá no hace falta un tercer caso, solo side/modal.
  const showSheet = selectedNodeId !== null && mode === 'side'
  const showDialog = selectedNodeId !== null && mode === 'modal'

  return (
    <div className="flex h-svh overflow-hidden bg-bg text-text">
      <div className="relative hidden shrink-0 p-3 md:block">
        <Sidebar onOpenPalette={() => setPaletteOpen(true)} onOpenShortcuts={() => setShortcutsDialogOpen(true)} />
        {/* Posición fija en la esquina superior del panel (no dentro del <nav>,
            que tiene overflow-x-hidden para el scroll vertical y recortaría un
            botón semi-flotando fuera del borde). Ancla a `right-3` — el mismo
            inset que el padding del wrapper — así queda pegado al borde real
            del panel tanto colapsado (w-14) como expandido (w-64), en vez de
            saltar a una fila propia debajo del avatar del workspace. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setSidebarPanelOpen(!sidebarPanelOpen)}
              aria-label={sidebarPanelOpen ? 'Colapsar barra lateral' : 'Expandir barra lateral'}
              className="dark-scope absolute top-6 right-3 z-10 flex size-6 translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-sm transition-colors hover:bg-surface-alt hover:text-text"
            >
              <HugeiconsIcon icon={sidebarPanelOpen ? PanelLeftCloseIcon : PanelLeftOpenIcon} className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {sidebarPanelOpen ? 'Colapsar barra lateral' : 'Expandir barra lateral'}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        <Topbar onOpenPalette={() => setPaletteOpen(true)} />
        {/* Plan de corrección de layout (2026-09-24), Corrección 3: "una
            caja por columna". El riel y el panel del sidebar son dos cajas
            flotantes (borde, radio, sombra) con un `p-3` de aire alrededor
            — el contenido no tenía ninguna de las dos cosas, así que se
            leía como texto suelto pegado al lado de dos paneles con marco.
            Ahora <main> ES la tercera caja, con el mismo `p-3` de aire
            (acá repartido: `md:pr-3 md:pb-3` en el wrapper de afuera — el
            top y el left ya los dan `Topbar`/el propio layout de flex) y
            el mismo lenguaje visual (`rounded-panel`/`border-border`/
            `bg-surface`/`shadow-panel`) que ya usan Sidebar.tsx/
            SidebarRail.tsx. Los PRs anteriores de esta corrección (#127,
            #128) ya se encargaron de que NADA adentro de esta caja tenga
            su propio borde/fondo/sombra — sin eso, esta caja habría sido
            una más apilada sobre las que ya existían.

            `md:`, no `@min-[...]:`: acá no importa el ancho REAL del
            contenido (eso es lo que la Corrección 4 y el resto de
            PageShell.tsx ya resuelven con @container), importa si hay
            sidebar o no — el mismo corte de viewport (768px) que decide
            si Sidebar.tsx está montado. En mobile la caja desaparece
            entera: el contenido va de borde a borde, como toda la app
            mobile ya se ve (tab bar, hojas, FAB — nada de eso vive dentro
            de un marco tampoco). */}
        <div className="min-h-0 flex-1 md:pr-3 md:pb-3">
          {/* @container: el ancho real disponible para el contenido
              depende de si el sidebar está colapsado/expandido, no solo
              del ancho de la ventana — las vistas de tareas usan
              variantes @min-[...]: (no sm:/md:) para reaccionar a ESTE
              ancho, no al del viewport. */}
          {/* overflow-x-hidden explícito: sin él, `overflow-y-auto` a
              secas deja overflow-x en su valor inicial (visible), que los
              navegadores tratan como "auto" en la práctica — cualquier
              hijo que se desborde horizontalmente (ej. la barra de
              herramientas de un proyecto sin flex-wrap, bug real
              encontrado en mobile) vuelve scrolleable TODA la página,
              arrastrando consigo el breadcrumb y las tabs de vista en vez
              de quedarse fijos. Contenido ancho de verdad (Tabla, Gantt,
              el tablero de Board) ya trae su propio `overflow-x-auto` en
              un contenedor propio — ver ProjectViewTabs.tsx/
              TableView.tsx/GanttChart.tsx — así que nada legítimo
              necesita escaparse de este límite. */}
          {/* La tab bar mide pt-1 + min-h-12 + pb-1 ≈ 56px, más la zona
              segura del borde inferior (el indicador de home del iPhone),
              que `pb-14` a secas no contemplaba — en un iPhone con notch
              la última fila de cualquier lista quedaba tapada. Solo
              cuando la barra está realmente visible: con el teclado
              abierto o en el detalle de tarea a pantalla completa
              (useShowMobileTabBar) no hay nada que tape el contenido. */}
          <main
            className={cn(
              '@container h-full min-w-0 overflow-x-hidden overflow-y-auto',
              'md:rounded-panel md:border md:border-border md:bg-surface md:shadow-panel',
              showTabBar && 'pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0',
            )}
          >
            {children}
          </main>
        </div>
      </div>
      <MobileTabBar />
      <MobileQuickCreate />

      {/* Gateado por showSheet/showDialog, no solo por selectedNodeId: con
          los dos gateados solo por selectedNodeId, cambiar de modo (side->
          modal) dejaba DOS instancias de NodeDetailContent montadas a la
          vez para la misma tarea — cada una con su propio useTaskPresence,
          compitiendo por el mismo canal Realtime y tirando toda la página
          ("cannot add presence callbacks... after subscribe()"). Bug real
          encontrado probando esto en navegador. */}
      {/* showCloseButton=false en ambos: NodeDetailContent ya trae su
          propio control de cerrar (integrado con el selector de modo) —
          con el X automático de shadcn quedaban dos botones de cerrar
          superpuestos. */}
      <Sheet open={showSheet} onOpenChange={(open) => !open && onCloseNode()}>
        {/* SheetContent ya trae `data-[side=right]:w-3/4 data-[side=right]:sm:max-w-sm`
            de fábrica — un override sin el prefijo `data-[side=right]:` exacto
            (ej. `sm:max-w-2xl` a secas) no gana el merge de tailwind-merge
            porque no lo reconoce como el mismo grupo de clase, así que
            quedaba angosto pase lo que pase. Hay que repetir el mismo
            prefijo para que se pise de verdad. */}
        <SheetContent
          side="right"
          showCloseButton={false}
          className="p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        >
          <SheetTitle className="sr-only">Detalle de tarea</SheetTitle>
          {/* key={selectedNodeId}: sin esto, pasar de una tarea a otra en
              el mismo Sheet no remonta el componente — su estado de
              título (`useState(task?.title ?? '')`) sobrevivía con lo
              tecleado en la tarea anterior (B-04). */}
          {showSheet && selectedNodeId && (
            <NodeDetailContent key={selectedNodeId} nodeId={selectedNodeId} onClose={onCloseNode} />
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={showDialog} onOpenChange={(open) => !open && onCloseNode()}>
        {/* `max-h-[85dvh] overflow-y-auto` ya vive en el primitivo
            (ui/dialog.tsx, R-03) — acá sólo el ancho/padding propios de
            este modal en particular. Sin el `max-w-2xl` SUELTO (sin
            prefijo) que había antes: ese pisaba el resguardo mobile
            `max-w-[calc(100%-2rem)]` del primitivo —mismo grupo de clase,
            mismo "sin variante"— y el modal quedaba pegado borde a borde
            en pantallas angostas. `sm:max-w-2xl` solo alcanza igual desde
            ahí para arriba. Auditoría mobile. */}
        <DialogContent showCloseButton={false} className="p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">Detalle de tarea</DialogTitle>
          {showDialog && selectedNodeId && (
            <NodeDetailContent key={selectedNodeId} nodeId={selectedNodeId} onClose={onCloseNode} />
          )}
        </DialogContent>
      </Dialog>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsDialogOpen} />
      <PushPromptDialog />
    </div>
  )
}
