import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Download01Icon } from '@hugeicons/core-free-icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { TreeNode } from '@/features/nodes/build-tree'
import { ImportTasksDialog } from '@/features/tasks/components/ImportTasksDialog'

// Importar CSV es una acción de una sola vez sobre un lote de filas, no una
// regla persistente como Automatizaciones — no hay nada que "aplique solo a
// todo el espacio" de forma continua, cada tarea importada de todos modos
// tiene que aterrizar en UNA lista concreta (una tarea siempre vive dentro
// de un proyecto). Por eso "Importaciones de espacio" es, a propósito, un
// atajo: elegir a cuál de las listas del espacio importar, sin tener que
// salir del menú de espacio y navegar hasta ahí — reusa ImportTasksDialog
// tal cual, cero lógica nueva de importación.
function collectProjects(node: TreeNode): { id: string; name: string }[] {
  const projects: { id: string; name: string }[] = []
  for (const child of node.children) {
    if (child.type === 'project') projects.push({ id: child.id, name: child.name })
    else projects.push(...collectProjects(child))
  }
  return projects
}

interface SpaceImportDialogProps {
  spaceNode: TreeNode
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SpaceImportDialog({ spaceNode, workspaceId, open, onOpenChange }: SpaceImportDialogProps) {
  const [projectId, setProjectId] = useState('')
  const projects = collectProjects(spaceNode)

  if (projectId) {
    return (
      <ImportTasksDialog
        projectId={projectId}
        workspaceId={workspaceId}
        open={open}
        onOpenChange={(next) => {
          if (!next) setProjectId('')
          onOpenChange(next)
        }}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Download01Icon} />
            Importar CSV en este espacio
          </DialogTitle>
        </DialogHeader>
        {projects.length === 0 ? (
          <p className="text-sm text-text-muted">Este espacio todavía no tiene ninguna lista.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label>Elegir lista</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="¿A qué lista se importa?" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
