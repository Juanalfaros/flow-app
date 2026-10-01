import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Folder02Icon, TaskDone01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useProjects, useStatuses } from '@/features/projects/queries'
import { useWorkspaceTaskSearch } from '@/features/tasks/queries'
import { useCreateTaskMutation } from '@/features/tasks/mutations'
import { isTypingTarget } from '@/features/tasks/useTaskSelection'
import { useTaskViewMode } from '@/features/nodes/task-view-mode'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { getLastProjectView } from '@/features/projects/last-project-view'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { projectId } = useParams({ strict: false })
  const viewMode = useTaskViewMode()
  const setNode = useSetNodeSearchParam()

  const { workspaceId } = useCurrentWorkspace()
  const { data: session } = useSession()
  const { data: profile } = useProfile(session?.user.id ?? '')
  const { data: projects } = useProjects(workspaceId)
  // Cross-proyecto a propósito: antes acotaba a `useTasks(projectId ?? '')`,
  // así que buscar una tarea que vivía en otro proyecto no traía nada — el
  // caso más común de usar un buscador. `enabled` (ver
  // workspaceTaskSearchQueryOptions) solo dispara con texto tipeado.
  const { data: searchedTasks } = useWorkspaceTaskSearch(workspaceId ?? '', search)
  const { data: statuses } = useStatuses(projectId ?? '')
  const createTaskMutation = useCreateTaskMutation(projectId ?? '')

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
        return
      }
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  function close() {
    onOpenChange(false)
    setSearch('')
  }

  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Buscar listas, tareas…"
      />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

        {projectId && defaultStatus && search.trim() && (
          <CommandGroup heading="Crear">
            <CommandItem
              value={`Crear tarea ${search}`}
              onSelect={() => {
                createTaskMutation.mutate({ title: search.trim(), statusId: defaultStatus.id })
                close()
              }}
            >
              <HugeiconsIcon icon={PlusSignIcon} />
              Crear tarea: "{search.trim()}"
            </CommandItem>
          </CommandGroup>
        )}

        <CommandGroup heading="Listas">
          {projects?.map((project) => (
            <CommandItem
              key={project.id}
              value={project.name}
              onSelect={() => {
                // Antes iba siempre a /summary — mismo criterio que el
                // árbol/favoritos del sidebar (S-03/S-09): respeta la
                // última vista visitada de esta lista, o la vista por
                // defecto de la cuenta si todavía no visitó ninguna.
                navigate({
                  to: getLastProjectView(project.id, defaultViewToRoute(profile?.default_view)),
                  params: { projectId: project.id },
                })
                close()
              }}
            >
              <HugeiconsIcon icon={Folder02Icon} />
              {project.name}
            </CommandItem>
          ))}
        </CommandGroup>

        {searchedTasks && searchedTasks.length > 0 && (
          <CommandGroup heading="Tareas">
            {searchedTasks.map((task) => (
              <CommandItem
                key={task.id}
                value={task.title}
                onSelect={() => {
                  if (!task.projectId) return
                  if (viewMode === 'side' || viewMode === 'modal') {
                    setNode(task.id)
                  } else {
                    navigate({ to: '/p/$projectId/t/$taskId', params: { projectId: task.projectId, taskId: task.id } })
                  }
                  close()
                }}
              >
                <HugeiconsIcon icon={TaskDone01Icon} />
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {task.projectName && (
                  <span className="ml-auto shrink-0 text-xs text-text-muted">{task.projectName}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Ir a">
          <CommandItem
            value="Miembros e invitaciones"
            onSelect={() => {
              // S-11: `/members` era válido pero solo por un redirect (ver
              // routes/_app/members.tsx) — navegar directo al destino real
              // evita la vuelta extra y la entrada de historial de más.
              navigate({ to: '/equipo/personas' })
              close()
            }}
          >
            <HugeiconsIcon icon={UserGroupIcon} />
            Miembros e invitaciones
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
