import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTaskTemplates, useProjectTemplates } from '@/features/templates/queries'
import {
  useRenameTaskTemplateMutation,
  useDeleteTaskTemplateMutation,
  useRenameProjectTemplateMutation,
  useDeleteProjectTemplateMutation,
} from '@/features/templates/mutations'

interface TemplatesPageProps {
  workspaceId: string
}

// Página propia (F5 #8), no una sección más de Perfil — plantillas es
// algo del workspace, al mismo nivel que Calendario/Timeline/Reportes en
// el sidebar, no una preferencia personal como Seguridad/Notificaciones.
// Crear una plantilla sigue viviendo en cada punto de uso ("Guardar como
// plantilla" en el detalle de tarea y en el menú "..." de cada lista) —
// acá solo listar/renombrar/borrar.
export function TemplatesPage({ workspaceId }: TemplatesPageProps) {
  const { data: taskTemplates } = useTaskTemplates(workspaceId)
  const { data: projectTemplates } = useProjectTemplates(workspaceId)

  return (
    <PageShell width="app" className="gap-6">
      <div>
        <h1 className="text-lg font-medium">Plantillas</h1>
        <p className="mt-1 text-sm text-text-muted">
          Tareas y listas guardadas para reusar, con sus etiquetas, subtareas, estados y campos personalizados.
        </p>
      </div>

      {/* auto-fill/minmax: las 2 tarjetas son intercambiables, sin techo de
          columnas fijo por breakpoint — mismo criterio que ReportsPage.tsx.
          `auto-fill`, no `auto-fit` (que tenía antes): con solo 2 tarjetas
          y de sobra para 4 columnas, `auto-fit` las estiraba a ~650px cada
          una — confirmado con captura de producción. `auto-fill` reserva
          las columnas vacías en vez de repartírselas a las 2 reales. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6">
        <TemplateGroup
          title="De tarea"
          emptyLabel="Sin plantillas de tarea todavía. Guardala desde el detalle de cualquier tarea (icono junto a Duplicar)."
          items={taskTemplates}
          useRename={useRenameTaskTemplateMutation}
          useDelete={useDeleteTaskTemplateMutation}
          workspaceId={workspaceId}
        />
        <TemplateGroup
          title="De lista completa"
          emptyLabel='Sin plantillas de lista todavía. Guardala desde el menú "..." del encabezado de cualquier lista.'
          items={projectTemplates}
          useRename={useRenameProjectTemplateMutation}
          useDelete={useDeleteProjectTemplateMutation}
          workspaceId={workspaceId}
        />
      </div>
    </PageShell>
  )
}

interface RenameMutationLike {
  mutate: (vars: { templateId: string; name: string }) => void
}

interface DeleteMutationLike {
  mutate: (templateId: string) => void
}

function TemplateGroup<T extends { id: string; name: string }>({
  title,
  emptyLabel,
  items,
  useRename,
  useDelete,
  workspaceId,
}: {
  title: string
  emptyLabel: string
  items: T[] | undefined
  useRename: (workspaceId: string) => RenameMutationLike
  useDelete: (workspaceId: string) => DeleteMutationLike
  workspaceId: string
}) {
  const renameMutation = useRename(workspaceId)
  const deleteMutation = useDelete(workspaceId)

  // Plan de corrección de layout (2026-09-24), Corrección 3: columna sin
  // caja propia (título en mono + filas con divisor), no una tarjeta
  // dentro de <main>. El input de renombrar queda sin borde hasta hover o
  // foco (border-transparent → border-input): se lee como texto plano
  // hasta que se lo va a editar, en vez de parecer un formulario abierto
  // permanente. `dark:!bg-transparent` con `!important` (ronda 2 de la
  // corrección, 2026-09-24): el Input base trae `dark:bg-input/30`, y sin
  // el `!` perdía el empate contra ese fondo en modo oscuro — mismo
  // parche que ya usan board.tsx/list.tsx para su input de "Agregar
  // tarea" (mismo problema, resuelto ahí primero).
  return (
    <div>
      <h2 className="mb-3 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">{title}</h2>
      {!items || items.length === 0 ? (
        <p className="text-xs text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1.5 py-1">
              <Input
                defaultValue={item.name}
                className="h-8 flex-1 border-transparent bg-transparent text-sm hover:border-input focus-visible:border-input dark:!bg-transparent"
                onBlur={(e) => {
                  const value = e.target.value.trim()
                  if (value && value !== item.name) renameMutation.mutate({ templateId: item.id, name: value })
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Eliminar plantilla"
                onClick={() => deleteMutation.mutate(item.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
