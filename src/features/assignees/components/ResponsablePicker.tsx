import { HugeiconsIcon } from '@hugeicons/react'
import { UserMultiple02Icon, StarIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useToggleTaskAssigneeMutation } from '@/features/assignees/mutations'
import { useUpdateTaskFieldsMutation } from '@/features/tasks/mutations'
import type { TaskAssigneeSummary } from '@/features/tasks/queries'
import { cn } from '@/lib/utils'

interface ResponsablePickerProps {
  workspaceId: string
  projectId: string
  taskId: string
  assignedMembers: TaskAssigneeSummary[]
  /** `nodes.assignee_id` — el "responsable principal" (a quién apunta el
   * feed de Calendar y la recurrencia, ver 0041_task_assignees.sql).
   * Opcional: solo NodeDetailContent (varios asignados posibles) necesita
   * la estrella — las subtareas tienen un único responsable, sin pool,
   * así que no pasan por acá (ver SubtaskAssigneePicker). */
  principalId?: string | null
  /** Trigger circular "+" en vez del botón ícono+texto "Asignados" por
   * defecto — usado en la fila "Asignados" del detalle de tarea, donde
   * la etiqueta de la fila ya dice "Asignados" y repetirlo en el botón
   * sería redundante. */
  compact?: boolean
}

// Clon de LabelPicker.tsx (Popover + Checkbox), poblado desde
// useWorkspaceMembers en vez de useLabels.
//
// La estrella de "responsable principal": 0041 ya promueve solo al
// primer asignado agregado (trg_promote_first_assignee) y reasigna
// solo al sacar al principal actual (trg_reassign_principal_on_removal)
// — la mayoría de las veces nadie necesita tocar esto a mano. La
// estrella cubre el resto: cambiar el principal entre dos personas que
// YA están asignadas, sin tener que sacar a una para que la otra quede
// promovida.
export function ResponsablePicker({
  workspaceId,
  projectId,
  taskId,
  assignedMembers,
  principalId = null,
  compact = false,
}: ResponsablePickerProps) {
  const { data: members } = useWorkspaceMembers(workspaceId)
  const toggleMutation = useToggleTaskAssigneeMutation(projectId)
  const updateMutation = useUpdateTaskFieldsMutation(projectId, taskId)
  const assignedIds = new Set(assignedMembers.map((a) => a.user_id))

  return (
    <Popover>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            aria-label="Agregar asignado"
            title="Agregar asignado"
            // `after:` agranda el área de toque de 24px a 40px sin
            // agrandar el círculo visible — mismo criterio que Checkbox
            // (ui/checkbox.tsx). Auditoría mobile.
            className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-text-muted after:absolute after:-inset-2 hover:border-accent hover:text-accent"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
          </button>
        ) : (
          <Button variant="ghost" size="sm">
            <HugeiconsIcon icon={UserMultiple02Icon} />
            Asignados
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="flex flex-col gap-1">
          {members?.length === 0 && (
            <p className="p-1 text-xs text-text-muted">Sin otros miembros en el workspace.</p>
          )}
          {members?.map((m) => {
            const assigned = assignedIds.has(m.user_id)
            const isPrincipal = principalId === m.user_id
            return (
              <div key={m.user_id} className="flex items-center gap-1 rounded px-1 py-1 hover:bg-surface">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <Checkbox
                    checked={assigned}
                    onCheckedChange={() =>
                      toggleMutation.mutate({
                        taskId,
                        member: { user_id: m.user_id, assignee: m.profile },
                        assigned,
                      })
                    }
                  />
                  {m.profile?.full_name ?? m.user_id}
                </label>
                {assigned && (
                  <button
                    type="button"
                    aria-label={
                      isPrincipal
                        ? `${m.profile?.full_name ?? 'Esta persona'} es responsable principal`
                        : `Marcar a ${m.profile?.full_name ?? 'esta persona'} como responsable principal`
                    }
                    aria-pressed={isPrincipal}
                    title="Responsable principal"
                    disabled={isPrincipal}
                    onClick={() => updateMutation.mutate({ assignee_id: m.user_id })}
                    className="shrink-0 rounded p-0.5 disabled:cursor-default"
                  >
                    <HugeiconsIcon
                      icon={StarIcon}
                      className={cn(
                        'size-3.5',
                        isPrincipal ? 'fill-accent-2 text-accent-2' : 'text-text-muted/50 hover:text-text-muted',
                      )}
                    />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
