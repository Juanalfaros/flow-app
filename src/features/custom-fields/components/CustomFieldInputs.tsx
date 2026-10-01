import { Label } from '@/components/ui/label'
import { useProjectCustomFields, useTaskCustomFieldValues } from '@/features/custom-fields/queries'
import { useUpsertCustomFieldValueMutation } from '@/features/custom-fields/mutations'
import { CustomFieldCell } from '@/features/custom-fields/components/CustomFieldCell'

interface CustomFieldInputsProps {
  projectId: string
  taskId: string
}

// Un input por campo definido en el proyecto (project_custom_fields,
// 0048), leyendo/escribiendo task_custom_field_values (0049) — sin tabla
// nueva por tipo, `value` es jsonb validado server-side contra
// `field_type` (validate_custom_field_value). El control por tipo vive en
// CustomFieldCell.tsx, compartido con la vista Tabla (F5 #4) — acá solo
// el layout de fila (etiqueta a la izquierda, control a la derecha,
// checkbox como excepción con la etiqueta al lado).
//
// Card propia (borde/sombra/título), no un `<div>` metido al fondo de la
// tarjeta "Detalles" con solo un `border-t` — así quedaba sin ningún
// título propio, lo último y menos visible del panel entero (auditoría de
// campos personalizados, reportado por el usuario: "quedan escondidos").
// Devuelve `null` sin campos, así que quien la monta (NodeDetailContent)
// no necesita saber de antemano si hay algo que mostrar.
export function CustomFieldInputs({ projectId, taskId }: CustomFieldInputsProps) {
  const { data: fields } = useProjectCustomFields(projectId)
  const { data: values } = useTaskCustomFieldValues(taskId)
  const upsertMutation = useUpsertCustomFieldValueMutation(taskId)

  if (!fields || fields.length === 0) return null

  return (
    <div className="rounded-card border border-border/60 bg-surface p-4 shadow-card">
      <h3 className="mb-2.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">
        Campos personalizados
      </h3>
      <div className="flex flex-col gap-2.5">
        {fields.map((field) => {
          const current = values?.find((v) => v.field_id === field.id)?.value

          if (field.field_type === 'checkbox') {
            return (
              <label key={field.id} className="flex items-center gap-2 text-xs">
                <CustomFieldCell
                  field={field}
                  value={current}
                  onChange={(value) => upsertMutation.mutate({ fieldId: field.id, value })}
                />
                {field.name}
              </label>
            )
          }

          return (
            <div key={field.id} className="flex items-center justify-between gap-2">
              <Label className="shrink-0 text-xs text-text-muted">{field.name}</Label>
              <div className="max-w-[60%]">
                <CustomFieldCell
                  field={field}
                  value={current}
                  onChange={(value) => upsertMutation.mutate({ fieldId: field.id, value })}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
