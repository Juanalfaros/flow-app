import { HugeiconsIcon } from '@hugeicons/react'
import { Archive01Icon, ViewIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { useArchivedNodes } from '@/features/nodes/queries'
import { useUnarchiveNodeMutation } from '@/features/nodes/mutations'
import { formatRelativeTime } from '@/lib/format-date'
import { Skeleton } from '@/components/ui/skeleton'

// Antes solo mostraba espacios ("Archivar" únicamente vivía en el menú
// de un espacio) — generalizado a carpetas y listas también
// (archivedNodesQueryOptions ya filtra a solo la "raíz" de cada subárbol
// archivado, para no listar cada carpeta/lista que se llevó puesta un
// espacio). Mismo esqueleto de página que TemplatesPage (F5 #8).
const TYPE_LABEL: Record<string, string> = {
  space: 'Espacio',
  folder: 'Carpeta',
  project: 'Lista',
}

export function ArchivedNodesPage({ workspaceId }: { workspaceId: string }) {
  const { data: archived, isLoading } = useArchivedNodes(workspaceId)
  const unarchiveMutation = useUnarchiveNodeMutation(workspaceId)

  return (
    <PageShell width="prose">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-medium">
          <HugeiconsIcon icon={Archive01Icon} />
          Archivados
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Espacios, carpetas y listas archivados desde el árbol del sidebar. Restaurar los devuelve a su lugar de
          siempre.
        </p>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Cargando archivados" className="flex flex-col divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      ) : !archived || archived.length === 0 ? (
        <p className="text-sm text-text-muted">No hay nada archivado.</p>
      ) : (
        // Plan de corrección de layout (2026-09-24), Corrección 3: filas
        // con divisor, no tarjetas — <main> ya es la caja de la columna.
        <ul className="flex flex-col divide-y divide-border">
          {archived.map((node) => (
            <li key={node.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {node.name}
                  <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    {TYPE_LABEL[node.type] ?? node.type}
                  </span>
                </p>
                <p className="text-xs text-text-muted">Archivado {formatRelativeTime(node.archived_at)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={unarchiveMutation.isPending}
                onClick={() =>
                  unarchiveMutation.mutate(node.id, {
                    onSuccess: () => toast.success('Restaurado.'),
                    onError: () => toast.error('No se pudo restaurar.'),
                  })
                }
              >
                <HugeiconsIcon icon={ViewIcon} />
                Restaurar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
