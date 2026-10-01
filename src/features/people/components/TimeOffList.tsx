import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon, Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingList, SettingRow } from '@/features/profile/components/settings-ui'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  TIME_OFF_KIND_LABEL,
  type TimeOffRow,
  useCreateTimeOffMutation,
  useDeleteTimeOffMutation,
  usePersonTimeOff,
  useUpdateTimeOffMutation,
} from '@/features/people/time-off'

/**
 * Lista de ausencias (alta, edición y borrado) — extraída de
 * PersonCalendarTab.tsx (donde un admin la ve dentro de la ficha de otra
 * persona) para reusarla tal cual en la pestaña Perfil de /profile.tsx
 * (donde cada quien ve y edita las suyas). Sin el feed de calendario ni los
 * eventos de Google acá: esos siguen siendo exclusivos de la ficha propia
 * en PersonCalendarTab, /profile los muestra aparte en su pestaña
 * Integraciones.
 */
export function TimeOffList({ workspaceId, userId, canEdit }: { workspaceId: string; userId: string; canEdit: boolean }) {
  const { data: rows, isPending } = usePersonTimeOff(workspaceId, userId)
  const deleteMutation = useDeleteTimeOffMutation(workspaceId)
  const [formState, setFormState] = useState<'closed' | 'adding' | { editing: TimeOffRow }>('closed')

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit &&
        (formState === 'closed' ? (
          <Button size="sm" variant="outline" onClick={() => setFormState('adding')} className="self-start">
            <HugeiconsIcon icon={PlusSignIcon} />
            Agregar ausencia
          </Button>
        ) : (
          <TimeOffForm
            workspaceId={workspaceId}
            userId={userId}
            editRow={formState === 'adding' ? undefined : formState.editing}
            onDone={() => setFormState('closed')}
          />
        ))}

      {(rows ?? []).length === 0 ? (
        <p className="text-xs text-text-muted">Sin ausencias registradas.</p>
      ) : (
        <SettingList>
          {(rows ?? []).map((row) => {
            const start = parseISO(row.starts_on)
            const end = parseISO(row.ends_on)
            const days = differenceInCalendarDays(end, start) + 1
            const startsIn = differenceInCalendarDays(start, new Date())
            return (
              <SettingRow
                key={row.id}
                icon={Calendar01Icon}
                title={`${TIME_OFF_KIND_LABEL[row.kind] ?? row.kind} · ${format(start, "d 'de' MMM", { locale: es })}${
                  row.starts_on !== row.ends_on ? ` – ${format(end, "d 'de' MMM", { locale: es })}` : ''
                }`}
                subtitle={[
                  days > 1 ? `${days} días` : '1 día',
                  startsIn > 0 ? `empiezan en ${startsIn} día${startsIn === 1 ? '' : 's'}` : startsIn === 0 ? 'empiezan hoy' : null,
                  row.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                wrap
                action={
                  canEdit && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setFormState({ editing: row })}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Eliminar ausencia"
                        onClick={() => deleteMutation.mutate(row.id)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} />
                      </Button>
                    </div>
                  )
                }
              />
            )
          })}
        </SettingList>
      )}
    </div>
  )
}

function TimeOffForm({
  workspaceId,
  userId,
  editRow,
  onDone,
}: {
  workspaceId: string
  userId: string
  editRow?: TimeOffRow
  onDone: () => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [startsOn, setStartsOn] = useState(editRow?.starts_on ?? today)
  const [endsOn, setEndsOn] = useState(editRow?.ends_on ?? today)
  const [kind, setKind] = useState(editRow?.kind ?? 'vacaciones')
  const [note, setNote] = useState(editRow?.note ?? '')
  const createMutation = useCreateTimeOffMutation(workspaceId)
  const updateMutation = useUpdateTimeOffMutation(workspaceId)
  const mutation = editRow ? updateMutation : createMutation

  // El check `ends_on >= starts_on` existe en la base (0026); acá se valida
  // igual para no gastar un round-trip en un error evitable.
  const invalidRange = endsOn < startsOn

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border p-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (invalidRange) return
        if (editRow) {
          updateMutation.mutate({ id: editRow.id, startsOn, endsOn, kind, note }, { onSuccess: onDone })
        } else {
          createMutation.mutate({ userId, startsOn, endsOn, kind, note }, { onSuccess: onDone })
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="time-off-start" className="text-xs">
            Desde
          </Label>
          <Input
            id="time-off-start"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="time-off-end" className="text-xs">
            Hasta
          </Label>
          <Input
            id="time-off-end"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            required
            aria-invalid={invalidRange}
          />
        </div>
      </div>
      {invalidRange && <span className="text-xs text-danger">La fecha de término no puede ser anterior.</span>}

      <Select value={kind} onValueChange={setKind}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(TIME_OFF_KIND_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (visible para el equipo)" />

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={mutation.isPending || invalidRange}>
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
