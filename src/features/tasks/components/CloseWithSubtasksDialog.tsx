import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar01Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDeliveryState } from '@/features/tasks/delivery-state'
import type { SubtaskSummary } from '@/features/tasks/queries'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

export type SubtaskCloseAction = 'discard' | 'complete' | 'promote'

interface CloseWithSubtasksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentTitle: string
  /** Ya filtradas a las "de alguien" (con responsable o fecha propia) que
   * siguen abiertas — las de tipo checklist se cerraron en cascada
   * silenciosa antes de siquiera llegar acá (ver NodeDetailContent.tsx). */
  pendingSubtasks: SubtaskSummary[]
  pending: boolean
  onConfirm: (action: SubtaskCloseAction) => void
}

const OPTIONS: { value: SubtaskCloseAction; label: string; hint: string }[] = [
  { value: 'discard', label: 'Descartarlas', hint: 'Ya no hacen falta. No cuentan como hechas.' },
  { value: 'complete', label: 'Darlas por hechas', hint: 'Se completan junto con la tarea.' },
  {
    value: 'promote',
    label: 'Dejarlas abiertas, fuera de esta tarea',
    hint: 'Suben a la lista como tareas sueltas.',
  },
]

// Decisión de producto: "Cerrar con subtareas abiertas" (artifact
// aprobado con el usuario). No es un "¿estás seguro?" — esos se confirman
// sin leer — es una pregunta cuya respuesta el sistema necesita igual,
// con las subtareas a la vista para poder responder sin cerrar el
// diálogo e ir a mirar (R2). Sin opción preseleccionada: confirmar queda
// inactivo hasta elegir una.
export function CloseWithSubtasksDialog({
  open,
  onOpenChange,
  parentTitle,
  pendingSubtasks,
  pending,
  onConfirm,
}: CloseWithSubtasksDialogProps) {
  const [picked, setPicked] = useState<SubtaskCloseAction | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setPicked(null)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">Terminar «{parentTitle}»</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-text-secondary">
          Queda{pendingSubtasks.length === 1 ? '' : 'n'} {pendingSubtasks.length} subtarea
          {pendingSubtasks.length === 1 ? '' : 's'} abierta{pendingSubtasks.length === 1 ? '' : 's'}. ¿Qué hacemos con
          ell{pendingSubtasks.length === 1 ? 'a' : 'as'}?
        </p>

        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border">
          {pendingSubtasks.map((s, i) => {
            const delivery = s.due_date ? formatDeliveryState(s.due_date, false, null) : null
            return (
              <div
                key={s.id}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 text-xs',
                  i > 0 && 'border-t border-border',
                )}
              >
                <Avatar size="sm" className="shrink-0">
                  {s.assignee?.avatar_url && <AvatarImage src={s.assignee.avatar_url} alt="" />}
                  <AvatarFallback>{s.assignee ? initials(s.assignee.full_name) : '—'}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {delivery && (
                  <span
                    className={cn(
                      'flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums',
                      delivery.state === 'overdue' ? 'text-danger-text' : 'text-text-muted',
                    )}
                  >
                    <HugeiconsIcon icon={Calendar01Icon} className="size-3" />
                    {delivery.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-1.5">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPicked(opt.value)}
              className={cn(
                'flex items-start gap-2.5 rounded-md border border-border p-2.5 text-left transition-colors hover:bg-surface-alt',
                picked === opt.value && 'border-accent bg-accent-soft hover:bg-accent-soft',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border-strong',
                  picked === opt.value && 'border-4 border-accent',
                )}
              />
              <span className="flex flex-col gap-0.5">
                <span className={cn('text-sm font-medium', picked === opt.value && 'text-accent-text-on-bg')}>
                  {opt.label}
                </span>
                <span className={cn('text-xs text-text-muted', picked === opt.value && 'text-accent-text-on-bg')}>
                  {opt.hint}
                </span>
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button disabled={!picked || pending} onClick={() => picked && onConfirm(picked)}>
            {pending ? 'Terminando…' : 'Terminar tarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
