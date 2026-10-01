import { Skeleton } from '@/components/ui/skeleton'
import { PageShell } from '@/components/layout/PageShell'

// Esqueletos de página completa — distintos de ProjectViewSkeleton.tsx
// (Board/List/Calendar/Gantt, adentro de un proyecto ya identificado):
// estos son para páginas de "chrome" (Inicio, Mis tareas, Plantillas,
// Archivados, Mi perfil, resumen de carpeta) que antes no mostraban nada
// mientras cargaban — ni un `role="status"`, directo un hueco en blanco o,
// peor, un estado "vacío" falso hasta que llegaban los datos reales.
// Auditoría de skeletons (2026-09-14).
//
// Sin tarjeta propia (borde/fondo/sombra) en los bloques de abajo — plan
// de corrección de layout, ronda 2 (2026-09-24): con la Corrección 3 el
// contenido real (SectionCard, filas de TemplatesPage/ArchivedNodesPage)
// ya no tiene esa caja, así que el esqueleto la mostraba mientras carga y
// la página saltaba a plana apenas llegaban los datos.

/**
 * Grilla tipo bento — Inicio (3 tiles + 2 tiles) y Mis tareas (idéntica
 * geometría de grid) comparten esta forma. El tile ancho/alto (índice 0)
 * imita la tile de mayor jerarquía de ambas páginas (Mis tareas / Mi
 * trabajo); el resto son tiles angostas apiladas.
 */
export function BentoSkeleton() {
  return (
    <PageShell width="app" role="status" aria-label="Cargando">
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-2 md:col-span-2 md:row-span-2">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ))}
      </div>
    </PageShell>
  )
}

/**
 * Lista simple con una acción por fila — hoy solo la usa Plantillas
 * (Archivados no tiene `pendingComponent` propio, arma su estado de carga
 * inline; el comentario original de este archivo decía que las dos lo
 * compartían, pero un grep de sus usos reales muestra que no).
 * `width="app"`, igual que TemplatesPage.tsx — antes era `max-w-2xl`, un
 * tercer valor que no coincidía con la página que este esqueleto imita.
 */
export function SimpleListPageSkeleton() {
  return (
    <PageShell width="app" className="gap-6" role="status" aria-label="Cargando">
      <Skeleton className="h-6 w-40" />
      <div className="flex flex-col divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
    </PageShell>
  )
}

/**
 * Mi perfil, rediseño con rail — mismas 2 columnas (rail angosto +
 * panel), no el layout viejo de tarjetas apiladas. Sin wrapper de página
 * propio (mx-auto/max-w/padding): profile.tsx ya renderiza ese contenedor
 * y su encabezado real por fuera de este gate, así que acá solo va el
 * contenido que reemplaza mientras `isLoading`.
 */
export function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Cargando perfil" className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      <div className="hidden shrink-0 flex-col gap-1.5 md:flex md:w-52">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>
    </div>
  )
}

/** Resumen de carpeta/espacio (f.$folderId.tsx): fila de 4 stat cards + tabla. */
export function FolderSummarySkeleton() {
  return (
    <div role="status" aria-label="Cargando" className="p-6 pb-16">
      <Skeleton className="mb-2 h-3 w-48" />
      <div className="mb-4 flex items-center gap-2.5">
        <Skeleton className="size-10 rounded-md" />
        <Skeleton className="h-6 w-56" />
      </div>
      <Skeleton className="mb-6 h-20 max-w-3xl rounded-md" />
      <div className="mb-6 grid grid-cols-2 gap-3 @min-[720px]:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-card" />
    </div>
  )
}

/** Filas de actividad (ActivityFeed) — summary.tsx y f.$folderId.tsx la
 *  usan mientras `isPending`, en vez del "Cargando…" de texto plano que
 *  tenía summary.tsx (f.$folderId.tsx no tenía ni siquiera eso, ver el
 *  comentario B-09 que ya documentaba este mismo bug en summary.tsx). */
export function ActivityRowsSkeleton() {
  return (
    <div role="status" aria-label="Cargando actividad" className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 flex-1" />
        </div>
      ))}
    </div>
  )
}
