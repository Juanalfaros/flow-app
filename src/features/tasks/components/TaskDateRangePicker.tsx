import { useState } from 'react'
import { format, isAfter, isBefore, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon, Clock01Icon, MultiplicationSignIcon, RepeatIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getQuickDatePresets, toDateKey } from '@/features/calendar/date-utils'
import type { TaskRecurrenceInput } from '@/features/tasks/api'
import type { TaskRecurrenceRow } from '@/features/tasks/queries'
import { cn } from '@/lib/utils'

export interface TaskDatesUpdate {
  start_date?: string | null
  due_date?: string | null
  start_time?: string | null
  due_time?: string | null
}

interface TaskDateRangePickerProps {
  startDate: string | null
  dueDate: string | null
  startTime: string | null
  dueTime: string | null
  recurrence: TaskRecurrenceRow | null
  /** Subtareas no recurren (v1) — ver 0021_task_scheduling_v2.sql, el
   * trigger de generación las ignora en silencio. Mejor ocultar el
   * control que ofrecer algo que no va a pasar nada al usarlo. */
  disableRecurrence?: boolean
  onDatesChange: (fields: TaskDatesUpdate) => void
  onRecurrenceChange: (rule: TaskRecurrenceInput | null) => void
  /** Trigger custom en vez de los dos chips "Inicio"/"Término" por
   * defecto — usado por NodeDetailContent para la fila "Fechas" del
   * detalle de tarea: ahí el chip de estado de entrega
   * (delivery-state.ts) ya muestra la fecha relevante, esto solo
   * necesita abrir el editor completo (mismo Popover, mismo contenido). */
  renderTrigger?: (openPicker: () => void) => React.ReactNode
}

function formatChip(date: string | null, time: string | null, placeholder: string): string {
  if (!date) return placeholder
  const label = format(parseISO(date), 'd MMM', { locale: es })
  return time ? `${label} · ${time}` : label
}

export function TaskDateRangePicker({
  startDate,
  dueDate,
  startTime,
  dueTime,
  recurrence,
  disableRecurrence,
  onDatesChange,
  onRecurrenceChange,
  renderTrigger,
}: TaskDateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<'start' | 'due'>('due')
  const [showTime, setShowTime] = useState(!!startTime || !!dueTime)
  const [showRecurrence, setShowRecurrence] = useState(false)

  function openFor(field: 'start' | 'due') {
    setEditing(field)
    setOpen(true)
  }

  function applyPreset(date: Date) {
    const key = toDateKey(date)
    if (editing === 'start') {
      const nextDue = dueDate && isAfter(date, parseISO(dueDate)) ? key : dueDate
      onDatesChange({ start_date: key, due_date: nextDue })
    } else {
      const nextStart = startDate && isBefore(date, parseISO(startDate)) ? key : startDate
      onDatesChange({ start_date: nextStart, due_date: key })
    }
  }

  function applyLaterToday() {
    const now = new Date()
    const later = new Date(now.getTime() + 3 * 60 * 60 * 1000)
    later.setMinutes(0, 0, 0)
    const key = toDateKey(now)
    const time = format(later, 'HH:mm')
    if (editing === 'start') onDatesChange({ start_date: key, start_time: time })
    else onDatesChange({ due_date: key, due_time: time })
    setShowTime(true)
  }

  function handleRangeSelect(range: DateRange | undefined) {
    const nextStart = range?.from ? toDateKey(range.from) : null
    const nextDue = range?.to ? toDateKey(range.to) : nextStart
    onDatesChange({ start_date: nextStart, due_date: nextDue })
  }

  // react-day-picker (addToRange, ver node_modules/react-day-picker/dist/esm/utils/addToRange.js)
  // solo sabe resolver un rango incompleto con `from` presente y `to` ausente.
  // Si a la tarea le falta `start_date` pero ya tiene `due_date`, pasarle
  // `{ from: undefined, to: dueDate }` cae en un estado que la librería no
  // contempla: `addToRange` no entra en ninguna rama, devuelve `undefined`
  // sin importar qué día se clickee, y eso termina borrando ambas fechas.
  // Solución: anclar siempre `from` en la fecha que exista (start si la hay,
  // si no due), nunca dejarlo vacío cuando hay una sola fecha seteada.
  function toCalendarRange(): DateRange | undefined {
    if (startDate && dueDate) return { from: parseISO(startDate), to: parseISO(dueDate) }
    if (startDate) return { from: parseISO(startDate), to: undefined }
    if (dueDate) return { from: parseISO(dueDate), to: undefined }
    return undefined
  }

  function clearField(field: 'start' | 'due', e: React.MouseEvent) {
    e.stopPropagation()
    if (field === 'start') onDatesChange({ start_date: null, start_time: null })
    else onDatesChange({ due_date: null, due_time: null })
  }

  const presets = getQuickDatePresets(new Date())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={renderTrigger ? undefined : 'flex items-center gap-1'}>
          {renderTrigger ? (
            renderTrigger(() => openFor('due'))
          ) : (
            <>
              <DateChip
                label="Inicio"
                value={formatChip(startDate, startTime, 'Inicio')}
                active={startDate !== null}
                onClick={() => openFor('start')}
                onClear={startDate ? (e) => clearField('start', e) : undefined}
              />
              <span className="text-text-muted">–</span>
              <DateChip
                label="Término"
                value={formatChip(dueDate, dueTime, 'Elegir fecha')}
                active={dueDate !== null}
                onClick={() => openFor('due')}
                onClear={dueDate ? (e) => clearField('due', e) : undefined}
              />
            </>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-auto p-0">
        {/* Apilado bajo `sm:` (no @container: este Popover se porta al
            body, sin contexto de contenedor propio — su ancho renderizado
            depende directo del viewport, ya acotado por el
            `max-w-[calc(100vw-2rem)]` de fábrica de PopoverContent) — en
            fila, atajos (144px) + un mes de calendario (~210-230px) suman
            ~355-375px, que roza ese tope a 390px de viewport y podía
            recortar el borde del calendario. Auditoría mobile. */}
        <div className="flex flex-col sm:flex-row">
          <div className="flex w-full flex-col gap-0.5 p-1.5 sm:w-36">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.date)}
                className="rounded-md px-2 py-1.5 text-left text-xs text-text hover:bg-surface-alt"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={applyLaterToday}
              className="rounded-md px-2 py-1.5 text-left text-xs text-text hover:bg-surface-alt"
            >
              Más tarde
            </button>
          </div>
          <Calendar
            mode="range"
            locale={es}
            selected={toCalendarRange()}
            onSelect={handleRangeSelect}
            className="border-t border-border/60 sm:border-t-0 sm:border-l"
          />
        </div>

        <div className="flex flex-col gap-1 border-t border-border/60 p-1.5">
          <button
            type="button"
            onClick={() => setShowTime((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-text hover:bg-surface-alt"
          >
            <HugeiconsIcon icon={Clock01Icon} className="size-3.5 text-text-muted" />
            Añadir hora
          </button>
          {showTime && (
            <div className="flex items-center gap-1.5 px-2 pb-1">
              <Input
                type="time"
                disabled={!startDate}
                value={startTime ?? ''}
                onChange={(e) => onDatesChange({ start_time: e.target.value || null })}
                className="h-7 text-xs"
              />
              <span className="text-text-muted">–</span>
              <Input
                type="time"
                disabled={!dueDate}
                value={dueTime ?? ''}
                onChange={(e) => onDatesChange({ due_time: e.target.value || null })}
                className="h-7 text-xs"
              />
            </div>
          )}

          {!disableRecurrence && (
            <>
              <button
                type="button"
                onClick={() => setShowRecurrence((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-text hover:bg-surface-alt"
              >
                <HugeiconsIcon icon={RepeatIcon} className="size-3.5 text-text-muted" />
                {recurrence ? 'Repetición activada' : 'Establecer repetición'}
              </button>
              {showRecurrence && (
                <RecurrenceEditor recurrence={recurrence} onChange={onRecurrenceChange} />
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DateChip({
  label,
  value,
  active,
  onClick,
  onClear,
}: {
  label: string
  value: string
  active: boolean
  onClick: () => void
  onClear?: (e: React.MouseEvent) => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label={label}
      className={cn('group/chip bg-bg', active && 'pr-1.5')}
    >
      <HugeiconsIcon icon={Calendar01Icon} />
      {value}
      {onClear && (
        <span
          role="button"
          tabIndex={-1}
          onClick={onClear}
          className="ml-0.5 flex size-4 items-center justify-center rounded-full text-text-muted hover:bg-surface-alt hover:text-text"
        >
          <HugeiconsIcon icon={MultiplicationSignIcon} className="size-3" />
        </span>
      )}
    </Button>
  )
}

const FREQUENCY_LABEL: Record<TaskRecurrenceInput['frequency'], string> = {
  daily: 'Diariamente',
  weekly: 'Semanalmente',
  monthly: 'Mensualmente',
  yearly: 'Anualmente',
}

type EndMode = 'never' | 'on_date' | 'after_n'

// Sub-panel separado del picker principal: junta su propio estado de
// edición (frecuencia/intervalo/fin) y solo emite `onChange` cuando el
// usuario confirma con "Guardar repetición" — evita disparar la mutación
// en cada tecla mientras se escribe el intervalo o la fecha de fin.
function RecurrenceEditor({
  recurrence,
  onChange,
}: {
  recurrence: TaskRecurrenceRow | null
  onChange: (rule: TaskRecurrenceInput | null) => void
}) {
  const [frequency, setFrequency] = useState<'none' | TaskRecurrenceInput['frequency']>(
    (recurrence?.frequency as TaskRecurrenceInput['frequency']) ?? 'none',
  )
  const [interval, setInterval] = useState(recurrence?.interval ?? 1)
  const [endMode, setEndMode] = useState<EndMode>(
    recurrence?.ends_on ? 'on_date' : recurrence?.occurrences_left != null ? 'after_n' : 'never',
  )
  const [endsOn, setEndsOn] = useState(recurrence?.ends_on ?? '')
  const [occurrences, setOccurrences] = useState(recurrence?.occurrences_left ?? 1)

  function handleFrequencyChange(value: string) {
    setFrequency(value as typeof frequency)
    if (value === 'none') onChange(null)
  }

  function handleSave() {
    if (frequency === 'none') {
      onChange(null)
      return
    }
    onChange({
      frequency,
      interval: Math.max(1, interval),
      endsOn: endMode === 'on_date' && endsOn ? endsOn : null,
      occurrencesLeft: endMode === 'after_n' ? Math.max(1, occurrences) : null,
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-alt/60 p-2">
      <Select value={frequency} onValueChange={handleFrequencyChange}>
        <SelectTrigger size="sm" className="w-full bg-bg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No se repite</SelectItem>
          {(Object.keys(FREQUENCY_LABEL) as TaskRecurrenceInput['frequency'][]).map((f) => (
            <SelectItem key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {frequency !== 'none' && (
        <>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            Cada
            <Input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value) || 1)}
              className="h-7 w-14 bg-bg text-xs"
            />
            {frequency === 'daily' && 'día(s)'}
            {frequency === 'weekly' && 'semana(s)'}
            {frequency === 'monthly' && 'mes(es)'}
            {frequency === 'yearly' && 'año(s)'}
          </div>

          <Select value={endMode} onValueChange={(v) => setEndMode(v as EndMode)}>
            <SelectTrigger size="sm" className="w-full bg-bg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">Nunca termina</SelectItem>
              <SelectItem value="on_date">Termina en fecha</SelectItem>
              <SelectItem value="after_n">Termina después de N veces</SelectItem>
            </SelectContent>
          </Select>

          {endMode === 'on_date' && (
            <Input
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              className="h-7 bg-bg text-xs"
            />
          )}
          {endMode === 'after_n' && (
            <Input
              type="number"
              min={1}
              value={occurrences}
              onChange={(e) => setOccurrences(Number(e.target.value) || 1)}
              className="h-7 w-20 bg-bg text-xs"
            />
          )}

          <Button type="button" size="sm" onClick={handleSave}>
            Guardar repetición
          </Button>
        </>
      )}
    </div>
  )
}
