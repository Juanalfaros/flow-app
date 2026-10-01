import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { queryClient } from '@/lib/query-client'
import { routeTree } from './routeTree.gen'
import './index.css'

// `scrollRestoration` (default false) guarda la posición de scroll por URL y
// la restaura al volver — sin esto, volver de una tarea a una lista larga
// deja al usuario arriba de todo. En escritorio es una molestia; en el
// drill-down mobile de la Fase 2 del rediseño de navegación (Espacios →
// espacio → lista → tarea, con "volver" explícito en cada nivel en vez de
// gesto nativo) es directamente roto sin esto — auditado como uno de los
// 4 huecos reales de plataforma antes de construir esa navegación.
const router = createRouter({ routeTree, context: { queryClient }, scrollRestoration: true })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
