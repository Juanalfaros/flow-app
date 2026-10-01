import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface RestoreCandidate {
  id: string
  title: string
  /** 'completed' = se había dado por hecha en cascada; 'dropped' = se
   * había descartado. Solo cambia el texto ("volver a…"), la mecánica de
   * restauración es la misma para las dos. */
  outcome: 'completed' | 'dropped'
}

interface RestoreSubtasksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentTitle: string
  candidates: RestoreCandidate[]
  pending: boolean
  /** `restore=false` es "no, dejarlas como están" — reabre igual la tarea
   * padre, solo que sin tocar las subtareas. */
  onConfirm: (restore: boolean) => void
}

// R3 de "Cerrar con subtareas abiertas": al reabrir el padre (salir de un
// estado 'success'), si la última vez que se cerró arrastró subtareas en
// cascada (trg_close_open_subtasks_on_parent_done, 0081/0082) y esas
// subtareas siguen tal cual quedaron entonces (nadie las tocó a mano
// desde), se ofrece deshacer esa parte también — nunca automático, mismo
// espíritu que el diálogo de cierre (CloseWithSubtasksDialog.tsx): es una
// pregunta, no un "¿estás seguro?".
export function RestoreSubtasksDialog({
  open,
  onOpenChange,
  parentTitle,
  candidates,
  pending,
  onConfirm,
}: RestoreSubtasksDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">Reabrir «{parentTitle}»</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-text-secondary">
          Al cerrar esta tarea se {candidates.length === 1 ? 'resolvió' : 'resolvieron'} {candidates.length} subtarea
          {candidates.length === 1 ? '' : 's'} junto con ella. ¿Volverla{candidates.length === 1 ? '' : 's'} a como
          estaba{candidates.length === 1 ? '' : 'n'} antes?
        </p>

        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border">
          {candidates.map((c, i) => (
            <li
              key={c.id}
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <span className="shrink-0 text-text-muted">
                {c.outcome === 'completed' ? 'se había dado por hecha' : 'se había descartado'}
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onConfirm(false)} disabled={pending}>
            No, dejarlas así
          </Button>
          <Button onClick={() => onConfirm(true)} disabled={pending}>
            {pending ? 'Restaurando…' : 'Restaurarlas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
