import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProjects, useStatuses } from '@/features/projects/queries'
import { useCreateTaskMutation } from '@/features/tasks/mutations'

interface QuickCreateTaskDialogProps {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// "Nueva tarea" de la cabecera de Inicio: a diferencia de `CreateTaskButton`
// (atajo de un proyecto ya abierto), acá todavía no hay proyecto — mismo
// problema que CompartirPage.tsx (share target), así que reusa su mismo
// patrón: `useProjects` para el picker, primer proyecto como default
// razonable, `useStatuses(projectId)` para resolver el estado inicial.
export function QuickCreateTaskDialog({ workspaceId, open, onOpenChange }: QuickCreateTaskDialogProps) {
  const { data: projects } = useProjects(workspaceId)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string | undefined>(undefined)
  const { data: statuses } = useStatuses(projectId ?? '')
  const createTaskMutation = useCreateTaskMutation(projectId ?? '')

  useEffect(() => {
    if (!projectId && projects?.[0]) setProjectId(projects[0].id)
  }, [projects, projectId])

  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nueva tarea"
      submitLabel={createTaskMutation.isPending ? 'Creando…' : 'Crear'}
      submitDisabled={!title.trim() || !projectId || !defaultStatus || createTaskMutation.isPending}
      onSubmit={(e) => {
        e.preventDefault()
        if (!projectId || !defaultStatus) return
        createTaskMutation.mutate(
          { title: title.trim(), statusId: defaultStatus.id },
          {
            onError: () => toast.error('No se pudo crear la tarea.'),
            onSuccess: () => {
              setTitle('')
              onOpenChange(false)
            },
          },
        )
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="home-quick-task-title">Título</Label>
        <Input
          id="home-quick-task-title"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nueva tarea"
          className="h-11 md:h-8"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="home-quick-task-project">Lista</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger id="home-quick-task-project" className="h-11 w-full md:h-8">
            <SelectValue placeholder="Elegir lista" />
          </SelectTrigger>
          <SelectContent>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FormDialog>
  )
}
