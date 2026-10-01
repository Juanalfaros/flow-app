import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Clock01Icon, Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTimeEntries } from '@/features/time-tracking/queries'
import { useCreateTimeEntryMutation, useDeleteTimeEntryMutation } from '@/features/time-tracking/mutations'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { formatShortDate } from '@/lib/format-date'
import { initials } from '@/lib/initials'

interface TimeTrackingPopoverProps {
  nodeId: string
}

// `entry_date` en zona local, mismo motivo que B-07 (calendar/date-utils.ts)
// y SelectionActionBar: `date.toISOString().slice(0,10)` interpreta la
// fecha como medianoche UTC, así que en Chile (UTC-3/4) cargar "hoy" de
// noche registraría el día siguiente.
function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// F5 #6: solo entrada manual (decisión de alcance cerrada con el
// usuario). Antes vivía como una sección propia, siempre abierta, entre
// Subtareas y Actividad — competía por atención con lo que sí se lee en
// cada visita (Descripción, Subtareas) en tareas donde nadie carga
// tiempo nunca. Pasa a ser una píldora más en la fila de metadata (junto
// a Etiquetas/Seguir/Revisores), mismo patrón que ReviewerPicker: un
// Popover con la lista + el mismo formulario de una línea de siempre,
// oculto hasta que alguien lo pide.
export function TimeTrackingPopover({ nodeId }: TimeTrackingPopoverProps) {
  const { data: session } = useSession()
  const { role } = useCurrentWorkspace()
  const userId = session?.user.id
  const isAdmin = role === 'owner' || role === 'admin'

  const { data: profile } = useProfile(userId ?? '')

  const { data: entries } = useTimeEntries(nodeId)
  // El email es lo único disponible sin otra query en `session`, pero no
  // es el nombre real — la fila optimista mostraba el email de la
  // persona hasta que llegaba la respuesta del servidor y la
  // reemplazaba. `useProfile` (ya cacheado en casi toda la app para el
  // usuario logueado) da el full_name real sin round-trip extra.
  const createMutation = useCreateTimeEntryMutation(nodeId, profile?.full_name ?? session?.user.email ?? 'Tú')
  const deleteMutation = useDeleteTimeEntryMutation(nodeId)

  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [entryDate, setEntryDate] = useState(todayLocalDate())
  const [note, setNote] = useState('')

  const totalMinutes = entries?.reduce((sum, e) => sum + e.minutes, 0) ?? 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0)
    if (total <= 0) return
    createMutation.mutate({ userId, minutes: total, entryDate, note: note.trim() || null })
    setHours('')
    setMinutes('')
    setNote('')
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <HugeiconsIcon icon={Clock01Icon} />
          {totalMinutes > 0 ? formatMinutes(totalMinutes) : 'Tiempo'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <p className="mb-2 text-xs font-medium text-text-muted">Tiempo registrado</p>

        {entries && entries.length > 0 ? (
          // Scroll interno en vez de un tope+expandir (como Actividad): al
          // estar detrás de un Popover ya cerrado por defecto, no compite
          // por atención — no hace falta recortarla de nuevo acá adentro.
          <ul className="mb-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
            {entries.map((entry) => {
              const canDelete = entry.user_id === userId || isAdmin
              return (
                <li key={entry.id} className="flex items-center gap-2 text-sm">
                  <Avatar size="sm">
                    {entry.user?.avatar_url && <AvatarImage src={entry.user.avatar_url} alt="" />}
                    <AvatarFallback>{initials(entry.user?.full_name ?? null)}</AvatarFallback>
                  </Avatar>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text-secondary">
                    {formatMinutes(entry.minutes)}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">{formatShortDate(entry.entry_date)}</span>
                  {entry.note && <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{entry.note}</span>}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Eliminar registro"
                      className="ml-auto shrink-0"
                      onClick={() => deleteMutation.mutate(entry.id)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mb-2 text-xs text-text-muted">Sin tiempo registrado todavía.</p>
        )}

        <form className="flex flex-wrap items-center gap-1.5" onSubmit={handleSubmit}>
          <Input
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="h"
            aria-label="Horas"
            className="h-8 w-14 text-sm"
          />
          <Input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="min"
            aria-label="Minutos"
            className="h-8 w-16 text-sm"
          />
          <Input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            aria-label="Fecha"
            className="h-8 w-auto text-sm"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional)"
            className="h-8 min-w-24 flex-1 text-sm"
          />
          <Button type="submit" variant="outline" size="sm" disabled={createMutation.isPending || !userId}>
            <HugeiconsIcon icon={PlusSignIcon} />
            Registrar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
