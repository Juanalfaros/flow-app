import { HugeiconsIcon } from '@hugeicons/react'
import { ExternalLinkIcon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CustomFieldDefinition } from '@/features/custom-fields/queries'
import type { Json } from '@/features/nodes/types'
import { cn } from '@/lib/utils'

// `options[].color` existe en la base hace rato (0048) pero nunca se leía
// en ningún lado del cliente — se veían como texto plano sin importar el
// color guardado. Mismo criterio de punto que FilterBar (etiquetas)/
// board.tsx (grupos): className de respaldo cuando no hay color (campos
// creados antes de que CustomFieldDefinitionDialog empezara a asignarlo).
function OptionDot({ color }: { color: string | null }) {
  return (
    <span
      className={cn('size-1.5 shrink-0 rounded-full', !color && 'bg-text-muted')}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

interface CustomFieldCellProps {
  field: CustomFieldDefinition
  value: Json | undefined
  onChange: (value: Json | null) => void
}

// Un input por tipo de campo (project_custom_fields.field_type), extraído
// de CustomFieldInputs.tsx (panel de detalle) — acá solo el control, sin
// la etiqueta ni el layout de fila, para que TableView.tsx (F5 #4) lo
// reuse dentro de una celda de grilla sin duplicar el switch por tipo ni
// la lógica de validación/mutación.
export function CustomFieldCell({ field, value, onChange }: CustomFieldCellProps) {
  if (field.field_type === 'checkbox') {
    return <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
  }

  if (field.field_type === 'select') {
    const selected = typeof value === 'string' ? field.options?.find((opt) => opt.id === value) : undefined
    return (
      <Select
        value={typeof value === 'string' ? value : '__none__'}
        onValueChange={(v) => onChange(v === '__none__' ? null : v)}
      >
        <SelectTrigger size="sm" className="h-7 w-full text-xs">
          {/* `children` explícito en vez de dejar que SelectValue resuelva
              solo el texto del ítem elegido — así el trigger cerrado
              muestra el mismo punto de color que la lista abierta, no solo
              la etiqueta. */}
          <SelectValue placeholder="Sin valor">
            {selected && (
              <>
                <OptionDot color={selected.color} />
                {selected.label}
              </>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Sin valor</SelectItem>
          {field.options?.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              <OptionDot color={opt.color} />
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // Área de texto (longText): único tipo multilínea — el resto (incluidos
  // url/email/phone/money, Nivel 2) cabe en el <Input> de una sola línea
  // de más abajo, solo cambia `type` para el teclado/validación nativa del
  // navegador (numérico en mobile para `tel`, etc.).
  if (field.field_type === 'longText') {
    return (
      <Textarea
        defaultValue={typeof value === 'string' ? value : ''}
        className="min-h-16 w-full resize-y text-xs"
        onBlur={(e) => onChange(e.target.value.trim() || null)}
      />
    )
  }

  const isNumeric = field.field_type === 'number' || field.field_type === 'money'
  const inputType =
    field.field_type === 'date'
      ? 'date'
      : field.field_type === 'url'
        ? 'url'
        : field.field_type === 'email'
          ? 'email'
          : field.field_type === 'phone'
            ? 'tel'
            : isNumeric
              ? 'number'
              : 'text'
  const currentUrl = field.field_type === 'url' && typeof value === 'string' ? value : ''

  return (
    <div className="flex items-center gap-1">
      {field.field_type === 'money' && <span className="shrink-0 text-xs text-text-muted">$</span>}
      <Input
        type={inputType}
        // Uncontrolled a propósito (defaultValue, no value) — mismo criterio
        // que el original: onChange en cada tecla dispararía un upsert por
        // carácter, onBlur alcanza y es lo que ya se usaba acá.
        defaultValue={typeof value === 'string' || typeof value === 'number' ? value : ''}
        className="h-7 w-full text-xs"
        onBlur={(e) => {
          const raw = e.target.value.trim()
          if (!raw) {
            onChange(null)
            return
          }
          onChange(isNumeric ? Number(raw) : raw)
        }}
      />
      {/* Solo cuando ya hay un valor guardado — abrir un campo vacío no
          tiene a dónde ir. rel="noreferrer" además de noopener: el destino
          es lo que la persona haya tipeado, sin garantía de confiar en él. */}
      {currentUrl && (
        <a
          href={currentUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Abrir enlace"
          className="shrink-0 text-text-muted hover:text-accent"
        >
          <HugeiconsIcon icon={ExternalLinkIcon} className="size-3.5" />
        </a>
      )}
    </div>
  )
}
