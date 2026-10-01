import { useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { useCreateTimeEntryMutation } from '@/features/time-tracking/mutations'
import { useMyOpenTasks } from '@/features/home/queries'

interface QuickTimeEntryDialogProps {
  workspaceId: string
  userId: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Mismo motivo de zona horaria que TimeTrackingPopover.tsx (B-07):
// `date.toISOString()` interpretaría "hoy" como medianoche UTC.
function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// "Registrar tiempo" de la cabecera de Inicio: `TimeTrackingPopover` vive
// atado a una tarea ya abierta (`nodeId` fijo). Acá todavía no hay tarea
// elegida, así que el picker es la propia lista de "Necesita tu acción"
// (`useMyOpenTasks`, ya en caché si la sección de abajo la cargó primero)
// en vez de pedir una tabla nueva solo para este picker.
export function QuickTimeEntryDialog({ workspaceId, userId, open, onOpenChange }: QuickTimeEntryDialogProps) {
  const { data: session } = useSession()
  const { data: profile } = useProfile(userId ?? '')
  const { data: tasks } = useMyOpenTasks(workspaceId, userId)

  const [taskId, setTaskId] = useState<string | undefined>(undefined)
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [entryDate, setEntryDate] = useState(todayLocalDate())
  const [note, setNote] = useState('')

  const createMutation = useCreateTimeEntryMutation(taskId ?? '', profile?.full_name ?? session?.user.email ?? 'Tú')
  const totalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0)

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar tiempo"
      submitLabel={createMutation.isPending ? 'Guardando…' : 'Registrar'}
      submitDisabled={!taskId || !userId || totalMinutes <= 0 || createMutation.isPending}
      onSubmit={(e) => {
        e.preventDefault()
        if (!taskId || !userId || totalMinutes <= 0) return
        createMutation.mutate(
          { userId, minutes: totalMinutes, entryDate, note: note.trim() || null },
          {
            onError: () => toast.error('No se pudo registrar el tiempo.'),
            onSuccess: () => {
              setHours('')
              setMinutes('')
              setNote('')
              onOpenChange(false)
            },
          },
        )
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="home-quick-time-task">Tarea</Label>
        <Select value={taskId} onValueChange={setTaskId}>
          <SelectTrigger id="home-quick-time-task" className="h-11 w-full md:h-8">
            <SelectValue placeholder="Elegir tarea" />
          </SelectTrigger>
          <SelectContent>
            {!tasks || tasks.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-text-muted">No tienes tareas abiertas.</div>
            ) : (
              tasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="home-quick-time-hours">Horas</Label>
          <Input
            id="home-quick-time-hours"
            type="number"
            min={0}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="0"
            className="h-11 md:h-8"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="home-quick-time-minutes">Minutos</Label>
          <Input
            id="home-quick-time-minutes"
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="0"
            className="h-11 md:h-8"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="home-quick-time-date">Fecha</Label>
        <Input
          id="home-quick-time-date"
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className="h-11 md:h-8"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="home-quick-time-note">Nota (opcional)</Label>
        <Input
          id="home-quick-time-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota"
          className="h-11 md:h-8"
        />
      </div>
    </FormDialog>
  )
}
