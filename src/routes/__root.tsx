import { useEffect } from 'react'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthListener } from '@/features/auth/components/AuthListener'
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister'
import { InstallPrompt } from '@/components/layout/InstallPrompt'
import { ErrorState, NotFoundState } from '@/components/layout/ErrorState'

export interface RouterContext {
  queryClient: QueryClient
}

// Sin estos dos, cualquier error que escape de una query (un rechazo de RLS,
// un fetch caído) desmontaba todo el árbol y dejaba pantalla en blanco, sin
// forma de volver. Los errorComponent de las rutas hijas (_app, p/$projectId)
// atajan primero y con más contexto; este es la última red.
// Sin `disableTransitionOnChange` a propósito: index.css ya tiene una
// transición global pensada para el cambio de tema (220ms, solo color/
// fondo/borde, respeta prefers-reduced-motion — ver ese archivo). Se
// probó a agregar esa prop cuando apareció un flash real al tocar el
// toggle, pero la causa de fondo era otra (una carrera de caché en
// useUpdateProfileMutation, ya resuelta con un update optimista) —
// `disableTransitionOnChange` inyecta un `* { transition: none
// !important }` durante el cambio, que apagaba también la transición
// buena de index.css y volvía el cambio de tema seco/instantáneo.
// Reportado por el usuario.
export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <RootLayout />
    </ThemeProvider>
  ),
  errorComponent: ({ error, reset }) => (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <div className="flex h-svh items-center justify-center bg-bg text-text">
        <ErrorState error={error} onRetry={reset} />
      </div>
    </ThemeProvider>
  ),
  notFoundComponent: () => (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <div className="flex h-svh items-center justify-center bg-bg text-text">
        <NotFoundState />
      </div>
    </ThemeProvider>
  ),
})

// `#FF0055` (el acento magenta; antes `#40e0d0` turquesa) fijo en index.html/manifest.webmanifest
// pintaba la barra de estado de iOS/Android de ese color en tema claro
// (auditoría de la Fase 2 del rediseño de navegación) — ninguna otra
// superficie de la app usa el acento como fondo sólido de página. Acá se
// sincroniza con `--bg` real de cada tema en CADA CAMBIO de preferencia
// (el script inline de index.html ya cubre la carga inicial antes del
// primer paint — ver su comentario — pero solo corre una vez; esto es lo
// que mantiene el color correcto si la persona cambia de tema en runtime,
// ver ThemeToggle.tsx). `resolvedTheme` (no el `theme` crudo, que puede
// ser 'system') ya resuelve la preferencia del SO igual que ese toggle.
const THEME_COLOR: Record<'light' | 'dark', string> = { light: '#F8FAFC', dark: '#0C0C0C' }

function RootLayout() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[resolvedTheme === 'dark' ? 'dark' : 'light'])
  }, [resolvedTheme])

  return (
    <TooltipProvider>
      <AuthListener />
      <ServiceWorkerRegister />
      <InstallPrompt />
      <Outlet />
      <Toaster theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />
    </TooltipProvider>
  )
}
