import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SaveAsTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName: string
  onSave: (name: string) => void
  isPending: boolean
}

// Un solo campo (nombre) — el resto (título/descripción/prioridad/
// etiquetas/subtareas, o estados/campos/tareas para una lista completa)
// lo snapshotea la RPC del lado del servidor (save_task_as_template/
// save_project_as_template, 0056_templates.sql), no hay nada más que
// pedir acá.
export function SaveAsTemplateDialog({ open, onOpenChange, defaultName, onSave, isPending }: SaveAsTemplateDialogProps) {
  const [name, setName] = useState(defaultName)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(defaultName)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Guardar como plantilla</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            onSave(name.trim())
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">Nombre de la plantilla</Label>
            <Input id="template-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
