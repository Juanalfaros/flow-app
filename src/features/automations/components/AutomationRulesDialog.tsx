import { useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, FlashIcon } from '@hugeicons/core-free-icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useStatuses } from '@/features/projects/queries'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useLabels } from '@/features/labels/queries'
import { useAutomationRules } from '@/features/automations/queries'
import {
  useCreateAutomationRuleMutation,
  useDeleteAutomationRuleMutation,
  useSetAutomationRuleEnabledMutation,
} from '@/features/automations/mutations'
import type { AutomationRuleRow } from '@/features/automations/api'
import { initials } from '@/lib/initials'

type Kind = AutomationRuleRow['kind']

const KIND_LABEL: Record<Kind, string> = {
  assign_on_create: 'Auto-asignar al crear',
  notify_on_status: 'Notificar al cambiar de estado',
  label_on_status: 'Etiqueta automática por estado',
  due_reminder: 'Recordatorio de vencimiento',
}

// Motor de reglas fijas por proyecto (0063_automation_rules.sql) — no un
// builder libre, las 4 combinaciones "cuando pasa esto → hacer esto"
// elegidas con el usuario. `due_reminder` es la única que no dispara desde
// un trigger de Postgres: corre desde un cron de Cloudflare (ver
// worker/automation-dispatch.ts), acá solo se activa/desactiva por
// proyecto.
export function AutomationRulesDialog({
  projectId,
  workspaceId,
  scope = 'project',
  open,
  onOpenChange,
}: {
  projectId: string
  workspaceId: string
  // 'space': reglas de espacio (0074_space_level_automations.sql) —
  // `projectId` acá es el id del nodo espacio. Disparan solas en
  // CUALQUIER proyecto de ese espacio (assign_on_create) o hacen match
  // por NOMBRE de estado contra la plantilla del espacio
  // (notify_on_status/label_on_status — cada proyecto tiene su propia
  // copia de estados, con su propio id, así que no se puede comparar
  // status_id directo). Si un proyecto tiene además su PROPIA regla
  // assign_on_create, esa gana sobre la de espacio.
  scope?: 'project' | 'space'
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: rules } = useAutomationRules(projectId)
  const { data: statuses } = useStatuses(projectId)
  const { data: members } = useWorkspaceMembers(workspaceId)
  const { data: labels } = useLabels(workspaceId)

  const createMutation = useCreateAutomationRuleMutation(projectId)
  const deleteMutation = useDeleteAutomationRuleMutation(projectId)
  const toggleMutation = useSetAutomationRuleEnabledMutation(projectId)

  const [kind, setKind] = useState<Kind>('assign_on_create')
  const [statusId, setStatusId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [notifyWholeProject, setNotifyWholeProject] = useState(false)
  const [labelId, setLabelId] = useState('')

  const memberName = (userId: string | null) =>
    members?.find((m) => m.user_id === userId)?.profile?.full_name ?? 'alguien'
  const statusName = (id: string | null) => statuses?.find((s) => s.id === id)?.name ?? 'estado eliminado'
  const labelName = (id: string | null) => labels?.find((l) => l.id === id)?.name ?? 'etiqueta eliminada'

  function describeRule(rule: AutomationRuleRow): string {
    switch (rule.kind) {
      case 'assign_on_create':
        return `Al crear una tarea sin responsable, asignarla a ${memberName(rule.target_user_id)}.`
      case 'notify_on_status':
        return rule.notify_whole_project
          ? `Al entrar a "${statusName(rule.status_id)}", notificar a todo el proyecto.`
          : `Al entrar a "${statusName(rule.status_id)}", notificar a ${memberName(rule.target_user_id)}.`
      case 'label_on_status':
        return `Al entrar a "${statusName(rule.status_id)}", agregar la etiqueta "${labelName(rule.label_id)}".`
      case 'due_reminder':
        return 'Si una tarea vence sin completarse, notificar a los asignados al día siguiente.'
      default:
        return rule.kind
    }
  }

  function resetForm() {
    setStatusId('')
    setTargetUserId('')
    setNotifyWholeProject(false)
    setLabelId('')
  }

  const canSubmit =
    kind === 'assign_on_create'
      ? !!targetUserId
      : kind === 'notify_on_status'
        ? !!statusId && (notifyWholeProject || !!targetUserId)
        : kind === 'label_on_status'
          ? !!statusId && !!labelId
          : true // due_reminder no necesita más datos

  function handleAdd() {
    createMutation.mutate(
      {
        project_id: projectId,
        kind,
        status_id: kind === 'notify_on_status' || kind === 'label_on_status' ? statusId : null,
        target_user_id: kind === 'assign_on_create' || (kind === 'notify_on_status' && !notifyWholeProject) ? targetUserId : null,
        notify_whole_project: kind === 'notify_on_status' ? notifyWholeProject : false,
        label_id: kind === 'label_on_status' ? labelId : null,
      },
      {
        onSuccess: () => {
          toast.success('Regla agregada.')
          resetForm()
        },
        onError: () => toast.error('No se pudo agregar la regla.'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={FlashIcon} />
            {scope === 'space' ? 'Automatizaciones del espacio' : 'Automatizaciones'}
          </DialogTitle>
          {scope === 'space' && (
            <p className="text-xs text-text-muted">
              Aplican solas en cualquier lista de este espacio, incluidas las que se creen después. Una regla propia
              de una lista específica gana sobre estas si ambas coinciden.
            </p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {!rules || rules.length === 0 ? (
            <p className="text-sm text-text-muted">Sin reglas todavía.</p>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={rule.enabled}
                    onCheckedChange={(v) =>
                      toggleMutation.mutate(
                        { id: rule.id, enabled: v === true },
                        { onError: () => toast.error('No se pudo actualizar la regla.') },
                      )
                    }
                  />
                  <div>
                    <p className="text-xs font-medium">{KIND_LABEL[rule.kind]}</p>
                    <p className="text-xs text-text-muted">{describeRule(rule)}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Borrar regla"
                  onClick={() =>
                    deleteMutation.mutate(rule.id, { onError: () => toast.error('No se pudo borrar la regla.') })
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
            ))
          )}
        </div>

        <Separator />

        <div className="flex flex-col gap-2.5">
          <p className="text-xs font-medium text-text-muted">Agregar regla</p>
          <div className="flex flex-col gap-1.5">
            <Label>Cuándo</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as Kind)
                resetForm()
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(kind === 'notify_on_status' || kind === 'label_on_status') && (
            <div className="flex flex-col gap-1.5">
              <Label>Estado</Label>
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Elegir estado" />
                </SelectTrigger>
                <SelectContent>
                  {statuses?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === 'assign_on_create' && (
            <div className="flex flex-col gap-1.5">
              <Label>Asignar a</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Elegir persona" />
                </SelectTrigger>
                <SelectContent>
                  {members?.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.full_name ?? initials(m.profile?.full_name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === 'notify_on_status' && (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="notify-whole-project"
                  checked={notifyWholeProject}
                  onCheckedChange={(v) => setNotifyWholeProject(v === true)}
                />
                <Label htmlFor="notify-whole-project" className="text-sm font-normal">
                  Notificar a todo el proyecto (en vez de una persona)
                </Label>
              </div>
              {!notifyWholeProject && (
                <div className="flex flex-col gap-1.5">
                  <Label>Notificar a</Label>
                  <Select value={targetUserId} onValueChange={setTargetUserId}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue placeholder="Elegir persona" />
                    </SelectTrigger>
                    <SelectContent>
                      {members?.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.profile?.full_name ?? initials(m.profile?.full_name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {kind === 'label_on_status' && (
            <div className="flex flex-col gap-1.5">
              <Label>Etiqueta</Label>
              <Select value={labelId} onValueChange={setLabelId}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Elegir etiqueta" />
                </SelectTrigger>
                <SelectContent>
                  {labels?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="button" size="sm" className="self-start" disabled={!canSubmit || createMutation.isPending} onClick={handleAdd}>
            {createMutation.isPending ? 'Agregando…' : 'Agregar regla'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
