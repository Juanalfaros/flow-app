import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Delete02Icon,
  ListSettingIcon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { PageShell } from '@/components/layout/PageShell'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNodeTree } from '@/features/nodes/queries'
import { buildTree, type TreeNode } from '@/features/nodes/build-tree'
import { Breadcrumb } from '@/features/nodes/components/Breadcrumb'
import { useUpdateCustomFieldMutation, useDeleteCustomFieldMutation } from '@/features/custom-fields/mutations'
import {
  useWorkspaceCustomFields,
  CUSTOM_FIELD_TYPE_LABEL,
  type CustomFieldDefinition,
  type CustomFieldOption,
  type CustomFieldType,
} from '@/features/custom-fields/queries'
import { TAG_PALETTE } from '@/features/labels/tag-colors'
import { formatShortDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

const ALL = '__all__'

// El único punto de partida para "¿qué campos personalizados existen en
// todo el workspace?" — antes la única forma de verlos era abrir el
// diálogo de Campos personalizados de CADA lista/espacio uno por uno, sin
// ningún panorama global (auditoría de campos personalizados, Nivel 3).
//
// "Ubicación" (no "tipo de tarea"): a diferencia de ClickUp, acá un campo
// pertenece a EXACTAMENTE un nodo (project_id, 0048) — no existe un campo
// compartido "en vivo" entre varias ubicaciones (los de espacio son una
// plantilla copiada una sola vez al crear cada lista, 0073) ni un concepto
// de "tipo de tarea" más allá de is_milestone (Tarea/Hito). Este Gestor
// muestra lo que el modelo de datos de verdad tiene: dónde vive cada
// campo, agrupados por tipo.
export function CustomFieldsManagerPage({ workspaceId }: { workspaceId: string }) {
  const { data: treeRows, isPending: treePending } = useNodeTree(workspaceId)
  const { byId } = useMemo(() => buildTree(treeRows ?? []), [treeRows])
  // 'project' y 'space' — un campo puede vivir en cualquiera de los dos
  // (space: plantilla compartida, ver el comentario de arriba).
  const locationIds = useMemo(
    () => (treeRows ?? []).filter((n) => n.type === 'project' || n.type === 'space').map((n) => n.id),
    [treeRows],
  )
  const { data: fields, isPending: fieldsPending } = useWorkspaceCustomFields(locationIds)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<CustomFieldType | typeof ALL>(ALL)

  const filtered = (fields ?? []).filter((f) => {
    if (typeFilter !== ALL && f.field_type !== typeFilter) return false
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const grouped = new Map<CustomFieldType, CustomFieldDefinition[]>()
  for (const field of filtered) {
    const list = grouped.get(field.field_type)
    if (list) list.push(field)
    else grouped.set(field.field_type, [field])
  }

  const pending = treePending || fieldsPending

  return (
    <PageShell width="prose">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-medium">
          <HugeiconsIcon icon={ListSettingIcon} />
          Gestor de campos personalizados
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Todos los campos definidos en cualquier espacio o lista de este workspace, en un solo lugar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-muted"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as CustomFieldType | typeof ALL)}>
          <SelectTrigger size="sm" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {(Object.entries(CUSTOM_FIELD_TYPE_LABEL) as [CustomFieldType, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pending ? (
        <div role="status" aria-label="Cargando campos personalizados" className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-surface-alt" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        // Plan de corrección de layout (2026-09-24), Corrección 3: sin
        // marco punteado — ícono y texto centrados, igual que el resto de
        // los vacíos de la app.
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <HugeiconsIcon icon={ListSettingIcon} className="size-6 text-text-muted/60" />
          <p className="text-sm text-text-muted">
            {fields?.length === 0
              ? 'Todavía no hay campos personalizados en este workspace.'
              : 'Ningún campo coincide con la búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {[...grouped.entries()].map(([type, list]) => (
            <section key={type}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
                {CUSTOM_FIELD_TYPE_LABEL[type]}
                <span className="rounded-full bg-surface-alt px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-text-muted">
                  {list.length}
                </span>
              </h2>
              <div className="flex flex-col divide-y divide-border">
                {list.map((field) => (
                  <CustomFieldManagerRow
                    key={field.id}
                    field={field}
                    workspaceId={workspaceId}
                    location={byId.get(field.project_id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  )
}

function CustomFieldManagerRow({
  field,
  workspaceId,
  location,
}: {
  field: CustomFieldDefinition
  workspaceId: string
  location: TreeNode | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()
  // Hook por-fila, no por-página: cada campo pertenece a un `project_id`
  // distinto (puede haber varios proyectos mezclados en la misma lista
  // filtrada), y estos hooks toman el project/space id al montarse — mismo
  // criterio que un componente de fila propio en cualquier lista de esta
  // app (ver TaskRow/BoardColumn).
  const updateMutation = useUpdateCustomFieldMutation(field.project_id)
  const deleteMutation = useDeleteCustomFieldMutation(field.project_id)

  // Las mutaciones ya parchean el cache de `projectCustomFieldsQueryOptions`
  // (el de un solo proyecto, que usa CustomFieldDefinitionDialog) — ese
  // patch no toca `workspaceCustomFieldsQueryOptions` (key distinta,
  // `['project-custom-fields', 'workspace', ...]`). En vez de reescribir
  // esas mutaciones compartidas para que conozcan esta pantalla, se
  // invalida ese prefijo acá al lado, nada más.
  function afterEdit() {
    void queryClient.invalidateQueries({ queryKey: ['project-custom-fields', 'workspace'] })
  }

  function commitOptions(options: CustomFieldOption[]) {
    updateMutation.mutate({ fieldId: field.id, fields: { options } }, { onSuccess: afterEdit })
  }

  const isSpace = location?.type === 'space'

  // Plan de corrección de layout (2026-09-24), Corrección 3: fila sin
  // caja propia (la separa el `divide-y` del padre) — el input de
  // renombrar queda sin borde hasta hover o foco, como en TemplatesPage.
  // `dark:!bg-transparent` (ronda 2, 2026-09-24): el Input base trae
  // `dark:bg-input/30`, que sin el `!important` le gana a `bg-transparent`
  // en modo oscuro — mismo parche que board.tsx/list.tsx.
  return (
    <div>
      <div className="flex items-center gap-1.5 p-2">
        {field.field_type === 'select' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={expanded ? 'Ocultar opciones' : 'Editar opciones'}
            onClick={() => setExpanded((v) => !v)}
          >
            <HugeiconsIcon icon={expanded ? ChevronDownIcon : ChevronRightIcon} className="size-3.5" />
          </Button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <Input
          defaultValue={field.name}
          aria-label="Nombre del campo"
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent hover:border-input focus-visible:border-input dark:!bg-transparent"
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== field.name) updateMutation.mutate({ fieldId: field.id, fields: { name } }, { onSuccess: afterEdit })
          }}
        />
        {location && (
          <div className="hidden shrink-0 items-center gap-1 text-xs @min-[480px]:flex">
            {!isSpace && <Breadcrumb workspaceId={workspaceId} nodeId={location.id} />}
            <Link
              to={isSpace ? '/f/$folderId' : '/p/$projectId/board'}
              params={isSpace ? { folderId: location.id } : { projectId: location.id }}
              className="max-w-32 truncate rounded-full bg-surface-alt px-2 py-0.5 text-text-secondary hover:underline"
            >
              {location.name}
            </Link>
          </div>
        )}
        <span className="hidden shrink-0 font-mono text-[10px] text-text-muted @min-[600px]:block">
          {formatShortDate(field.created_at)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Eliminar campo "${field.name}"`}
          onClick={() => deleteMutation.mutate(field.id, { onSuccess: afterEdit })}
        >
          <HugeiconsIcon icon={Delete02Icon} />
        </Button>
      </div>

      {expanded && field.field_type === 'select' && (
        <OptionsEditor options={field.options ?? []} onCommit={commitOptions} />
      )}
    </div>
  )
}

// Antes no existía NINGUNA forma de editar las opciones de un campo
// Desplegable después de crearlo — CustomFieldDefinitionDialog solo deja
// crear el campo entero con todas sus opciones de una vez (separadas por
// coma) o borrarlo entero. Acá sí: agregar/renombrar/quitar una opción
// suelta, sin tocar el resto.
function OptionsEditor({
  options,
  onCommit,
}: {
  options: CustomFieldOption[]
  onCommit: (options: CustomFieldOption[]) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border/60 p-2.5">
      {options.map((opt, i) => (
        <div key={opt.id} className="flex items-center gap-1.5">
          <span
            className={cn('size-2 shrink-0 rounded-full', !opt.color && 'bg-text-muted')}
            style={opt.color ? { backgroundColor: opt.color } : undefined}
          />
          <Input
            defaultValue={opt.label}
            aria-label="Nombre de la opción"
            className="h-7 min-w-0 flex-1 border-transparent bg-transparent text-xs hover:border-input focus-visible:border-input dark:!bg-transparent"
            onBlur={(e) => {
              const label = e.target.value.trim()
              if (!label || label === opt.label) return
              onCommit(options.map((o, j) => (j === i ? { ...o, label } : o)))
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Quitar opción "${opt.label}"`}
            onClick={() => onCommit(options.filter((_, j) => j !== i))}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          onCommit([
            ...options,
            {
              id: crypto.randomUUID(),
              label: 'Nueva opción',
              color: (TAG_PALETTE[options.length % TAG_PALETTE.length] ?? TAG_PALETTE[0]).hex,
            },
          ])
        }
      >
        <HugeiconsIcon icon={PlusSignIcon} />
        Agregar opción
      </Button>
    </div>
  )
}
