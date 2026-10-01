import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { ConnectionStatusIndicator } from '@/components/layout/ConnectionStatusIndicator'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { UserMenu } from '@/components/layout/UserMenu'
import { useMobileBack } from '@/components/layout/use-mobile-back'
import { MOD_KEY_HINT } from '@/lib/platform'
import { cn } from '@/lib/utils'

interface TopbarProps {
  onOpenPalette: () => void
}

// El botón de hamburguesa + Sheet con el Sidebar entero se fue con la
// Fase 2 del rediseño de navegación: en mobile, la navegación principal
// ahora es la tab bar fija de abajo (MobileTabBar.tsx, montada desde
// AppShell.tsx) — no hace falta un segundo camino de navegación acá
// arriba.
//
// Paridad con el prototipo móvil (Fase 3): en las pantallas de drill-down
// (una carpeta/espacio, una lista, el detalle de una tarea) esta barra
// pasa a ser CONTEXTUAL — "atrás" con el nombre del nivel anterior real +
// el título de la pantalla, que así queda fijo arriba en vez de ser un
// <h1> que se va con el scroll. En las 4 raíces de la tab bar no hay
// nivel anterior, así que se queda exactamente como estaba (buscar +
// acciones globales). Ver use-mobile-back.ts para de dónde sale cada uno.
export function Topbar({ onOpenPalette }: TopbarProps) {
  const back = useMobileBack()

  return (
    // `pt` con la zona segura: `index.html` trae `viewport-fit=cover`
    // (hace falta para el `env(safe-area-inset-bottom)` de la tab bar),
    // y eso mete el contenido DEBAJO de la barra de estado/notch en una
    // PWA instalada — hasta ahora esta cabecera quedaba pisada por el
    // reloj del sistema. En navegador y en escritorio el `env()` vale 0,
    // así que no cambia nada ahí.
    // md:border-b-0: plan de corrección de layout, ronda 2 (2026-09-24).
    // Desde md: hacia arriba, <main> (AppShell.tsx, Corrección 3) ya tiene
    // su propio borde superior — con el border-b de acá pegado justo
    // encima (el wrapper de <main> no tiene aire arriba, solo a la
    // derecha y abajo, ver AppShell.tsx), quedaban dos líneas tocándose,
    // como si la caja siguiera pegada a la topbar. En mobile (sin caja en
    // <main>) el border-b se queda: sigue siendo la única separación
    // entre la topbar y el contenido.
    <header className="flex items-center gap-1.5 border-b border-border bg-bg px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:gap-2 md:border-b-0 md:px-3 md:pt-2">
      {back && (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 md:hidden">
          <Link
            {...back.link}
            className="flex min-h-11 shrink-0 items-center gap-0.5 rounded-md pr-1 text-sm text-accent-text-on-bg transition-colors active:bg-surface-alt"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4 shrink-0" />
            <span className="max-w-32 truncate">{back.label}</span>
          </Link>
          {/* Vacío en el detalle de tarea a propósito — ahí el título es el
              <h1> grande del cuerpo, no una versión achicada acá arriba. */}
          {back.title && <span className="min-w-0 flex-1 truncate text-sm font-semibold">{back.title}</span>}
        </div>
      )}

      {/* Ícono redondo en mobile (el texto y el atajo ⌘K/Ctrl+K no aportan
          nada sin teclado); pill completa con placeholder desde md: hacia
          arriba. El corte es `md:`, no `sm:`, para que coincida con el
          mismo breakpoint donde desaparece la cabecera contextual — si no,
          entre 640 y 768px (teléfono apaisado) convivían la pill ancha y
          el "atrás", peleando por la misma fila. */}
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Buscar o crear…"
        className="flex size-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-surface text-text-muted transition-colors hover:bg-surface-alt active:bg-surface-alt focus-visible:outline-2 focus-visible:outline-accent md:h-auto md:w-auto md:max-w-xs md:flex-1 md:justify-start md:px-3 md:py-1.5"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 md:size-3.5" />
        <span className="hidden md:inline">Buscar o crear…</span>
        <span className="ml-auto hidden shrink-0 rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium md:inline">
          {MOD_KEY_HINT}
        </span>
      </button>

      {/* En una pantalla de drill-down el grupo entero se va en mobile: no
          entran "atrás" + título + 4 controles en 390px, y ninguno de los
          4 es contextual — tema y perfil viven en la hoja "Más"
          (Ajustes), y las no leídas ya tienen su badge en la pestaña
          Bandeja. Mismo criterio que el prototipo, que en drill-down deja
          como mucho 2 acciones. */}
      <div className={cn('ml-auto flex shrink-0 items-center gap-1 sm:gap-2', back && 'hidden md:flex')}>
        <ConnectionStatusIndicator />
        <ThemeToggle />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}
