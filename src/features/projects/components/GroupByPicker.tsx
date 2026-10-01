import { GroupItemsIcon } from '@hugeicons/core-free-icons'
import { IconFilterDropdown } from '@/features/projects/components/IconFilterDropdown'
import { useProjectCustomFields } from '@/features/custom-fields/queries'
import { decodeGroupBy } from '@/features/nodes/useNodeViewController'

const BUILTIN_LABEL: Record<'status' | 'assignee' | 'priority' | 'label' | 'dueDate' | 'taskType', string> = {
  status: 'Estado',
  assignee: 'Persona asignada',
  priority: 'Prioridad',
  label: 'Etiquetas',
  dueDate: 'Fecha límite',
  taskType: 'Tipo de tarea',
}

// Board/Lista comparten este control — ninguna de las dos vistas conoce el
// detalle de qué campos personalizados tipo `select` tiene el proyecto,
// eso vive acá adentro (useProjectCustomFields). El valor viaje como un
// string plano (ver encodeGroupBy/decodeGroupBy) porque así es como ya
// vive en la URL (TaskFilters.groupBy) — este componente solo arma las
// opciones y traduce a una etiqueta legible para el tooltip.
export function GroupByPicker({
  projectId,
  value,
  onChange,
}: {
  projectId: string
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const { data: customFields } = useProjectCustomFields(projectId)
  // Solo `select`: es el único tipo con un conjunto finito y ordenado de
  // valores (options[], con color) — texto/número/fecha/checkbox no dan
  // columnas con sentido (¿una columna por cada fecha distinta?).
  const selectFields = (customFields ?? []).filter((f) => f.field_type === 'select')

  const current = value ?? 'status'
  const decoded = decodeGroupBy(value)
  const currentLabel =
    decoded.kind === 'customField'
      ? (selectFields.find((f) => f.id === decoded.field)?.name ?? 'Campo personalizado')
      : BUILTIN_LABEL[decoded.kind]

  return (
    <IconFilterDropdown
      icon={GroupItemsIcon}
      tooltip={`Agrupar por: ${currentLabel}`}
      active={decoded.kind !== 'status'}
      value={current}
      onChange={(v) => onChange(v === 'status' ? undefined : v)}
      options={[
        { value: 'status', label: BUILTIN_LABEL.status },
        { value: 'assignee', label: BUILTIN_LABEL.assignee },
        { value: 'priority', label: BUILTIN_LABEL.priority },
        { value: 'label', label: BUILTIN_LABEL.label },
        { value: 'dueDate', label: BUILTIN_LABEL.dueDate },
        { value: 'taskType', label: BUILTIN_LABEL.taskType },
        ...selectFields.map((f) => ({ value: `field:${f.id}`, label: f.name })),
      ]}
    />
  )
}
