import { Skeleton } from '@/components/ui/skeleton'

// Placeholders con la MISMA geometría que la vista real (columnas w-72 en
// board, filas h-9 en list) — el objetivo es que al llegar los datos nada
// salte de lugar. Los `aria-hidden` los pone la propia Skeleton; el wrapper
// lleva role="status" para que un lector de pantalla anuncie la carga en vez
// de leer una región vacía.

export function BoardSkeleton() {
  return (
    <div role="status" aria-label="Cargando tablero" className="flex items-start gap-4 overflow-hidden pb-2">
      {[0, 1, 2].map((col) => (
        <div key={col} className="w-[85vw] max-w-72 shrink-0 rounded-card border border-border/60 bg-surface p-3 sm:w-72">
          <div className="mb-3 flex items-center gap-1.5">
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 - col }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-card" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ListSkeleton() {
  return (
    <div role="status" aria-label="Cargando tareas" className="flex flex-col gap-1">
      {[0, 1].map((section) => (
        <div key={section} className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 py-2">
            <Skeleton className="size-1.5 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          {Array.from({ length: 4 - section }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ))}
    </div>
  )
}

// Reusado por Calendario/Gantt tanto por-proyecto (calendar.tsx/gantt.tsx)
// como global (calendario.tsx/timeline.tsx, S-06) — auditoría de
// skeletons: ninguna de las 4 tenía ningún estado de carga, ni siquiera
// texto plano.

export function CalendarSkeleton() {
  return (
    <div role="status" aria-label="Cargando calendario" className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-8" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={row} className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, col) => (
            <Skeleton key={col} className="h-20 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function GanttSkeleton() {
  return (
    <div role="status" aria-label="Cargando línea de tiempo" className="flex flex-col gap-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-32 shrink-0" />
          <Skeleton className="h-5 flex-1 rounded-md" style={{ marginLeft: `${(i % 4) * 8}%` }} />
        </div>
      ))}
    </div>
  )
}
