import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { BookmarkAdd01Icon, CheckListIcon, ChevronDownIcon, Flag02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useCreateTaskMutation } from '@/features/tasks/mutations'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useTaskTemplates } from '@/features/templates/queries'
import { useInstantiateTaskTemplateMutation } from '@/features/templates/mutations'
import { between } from '@/lib/position'
import { cn } from '@/lib/utils'

interface CreateTaskButtonProps {
  projectId: string
  /** Status por default del proyecto (mismo criterio que el input inline
   * de list.tsx: `statuses?.find(s => s.is_default) ?? statuses?.[0]`) —
   * este botón es un atajo global, no reemplaza los inputs por
   * columna/lista existentes. */
  statusId: string | undefined
}

// Atajo "+ Tarea" del toolbar: dropdown con Tarea/Hito/Desde plantilla
// (F5 #8 — los dos primeros son los únicos tipos con respaldo real en el
// schema, nodes.is_milestone). Al elegir Tarea/Hito, el trigger se
// reemplaza por un input inline de título; "Desde plantilla" por un
// picker que instancia al elegir.
export function CreateTaskButton({ projectId, statusId }: CreateTaskButtonProps) {
  const [mode, setMode] = useState<'tarea' | 'hito' | 'plantilla' | null>(null)
  const [title, setTitle] = useState('')
  const createTaskMutation = useCreateTaskMutation(projectId)
  const { workspaceId } = useCurrentWorkspace()
  const { data: templates } = useTaskTemplates(workspaceId ?? '')
  const instantiateMutation = useInstantiateTaskTemplateMutation()

  function submit() {
    if (!title.trim() || !statusId || !mode) {
      setMode(null)
      setTitle('')
      return
    }
    createTaskMutation.mutate(
      { title: title.trim(), statusId, isMilestone: mode === 'hito' },
      { onError: () => toast.error('No se pudo crear la tarea.') },
    )
    setMode(null)
    setTitle('')
  }

  if (mode === 'plantilla') {
    return (
      <Select
        open
        onOpenChange={(open) => !open && setMode(null)}
        onValueChange={(templateId) => {
          if (!statusId) return
          instantiateMutation.mutate(
            { templateId, containerId: projectId, statusId, position: between(undefined, undefined) },
            { onError: () => toast.error('No se pudo crear la tarea desde la plantilla.') },
          )
          setMode(null)
        }}
      >
        <SelectTrigger className="h-8 w-48" size="sm">
          <SelectValue placeholder="Elegir plantilla…" />
        </SelectTrigger>
        <SelectContent>
          {!templates || templates.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-text-muted">Sin plantillas todavía.</div>
          ) : (
            templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    )
  }

  if (mode) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setMode(null)
              setTitle('')
            }
          }}
          placeholder={mode === 'hito' ? 'Nuevo hito' : 'Nueva tarea'}
          className="h-8 w-48"
        />
      </form>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          disabled={!statusId}
          className={cn('bg-accent text-accent-foreground hover:bg-accent/90 aria-expanded:bg-accent/90')}
        >
          <HugeiconsIcon icon={PlusSignIcon} />
          Tarea
          <HugeiconsIcon icon={ChevronDownIcon} className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setMode('tarea')}>
          <HugeiconsIcon icon={CheckListIcon} />
          Tarea
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setMode('hito')}>
          <HugeiconsIcon icon={Flag02Icon} />
          Hito
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setMode('plantilla')}>
          <HugeiconsIcon icon={BookmarkAdd01Icon} />
          Desde plantilla
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
