import { useState, type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserAdd01Icon, Tick02Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useInviteMembersMutation } from '@/features/workspace/mutations'
import { INVITE_ROLES, type InviteRoleOption } from '@/features/workspace/roles'
import { cn } from '@/lib/utils'

/**
 * Separa por coma, espacio, punto y coma o salto de línea.
 *
 * Un solo campo para varios correos en vez de un formulario por persona: al
 * dar de alta un equipo se pegan todos juntos desde una planilla o un mail, y
 * obligar a invitar de a uno convierte eso en diez pasadas por el formulario.
 */
function parseEmails(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
}

// Validación deliberadamente laxa: solo descarta lo que claramente no es un
// correo. Quien decide de verdad es GoTrue al enviar; una regex estricta acá
// solo lograría rechazar direcciones válidas raras pero legítimas.
function isProbablyEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

interface InviteMembersDialogProps {
  workspaceId: string
  /** Si no se pasa, se usa un botón "Invitar" por defecto. */
  trigger?: ReactNode
}

export function InviteMembersDialog({ workspaceId, trigger }: InviteMembersDialogProps) {
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [role, setRole] = useState('member')
  const mutation = useInviteMembersMutation(workspaceId)

  const emails = parseEmails(raw)
  const invalid = emails.filter((e) => !isProbablyEmail(e))
  const valid = emails.filter(isProbablyEmail)
  const selected = INVITE_ROLES.find((r) => r.value === role) ?? INVITE_ROLES[0]

  function reset() {
    setRaw('')
    setRole('member')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (valid.length === 0 || invalid.length > 0) return
    mutation.mutate(
      { emails: valid, role },
      {
        onSuccess: ({ sent, failed }) => {
          if (sent.length > 0) {
            toast.success(
              sent.length === 1 ? `Invitación enviada a ${sent[0]}` : `${sent.length} invitaciones enviadas`,
            )
          }
          // Los fallos se informan uno por uno: con varios correos, un
          // "algunas fallaron" no dice cuáles hay que reintentar.
          for (const f of failed) toast.error(`${f.email}: ${f.reason}`)
          if (failed.length === 0) {
            reset()
            setOpen(false)
          } else {
            setRaw(failed.map((f) => f.email).join(', '))
          }
        },
        onError: () => toast.error('No se pudieron enviar las invitaciones.'),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <HugeiconsIcon icon={UserAdd01Icon} />
            Invitar
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={UserGroupIcon} className="size-4" />
            Invitar a personas
          </DialogTitle>
          <DialogDescription>
            Reciben un correo con un enlace para elegir su nombre y contraseña.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-emails">Email</Label>
            <Input
              id="invite-emails"
              autoFocus
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Escribe los correos separados por coma o espacio"
              aria-invalid={invalid.length > 0}
              aria-describedby="invite-emails-hint"
            />
            <span id="invite-emails-hint" className="text-xs text-text-muted">
              {invalid.length > 0 ? (
                <span className="text-danger">No parecen correos válidos: {invalid.join(', ')}</span>
              ) : valid.length > 1 ? (
                `${valid.length} personas`
              ) : (
                'Puedes pegar varios de una vez.'
              )}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Invitar como</Label>
            <RolePicker value={role} onChange={setRole} selected={selected} />
            <span className="text-xs text-text-muted">{selected.description}</span>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={mutation.isPending || valid.length === 0 || invalid.length > 0}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <HugeiconsIcon icon={UserAdd01Icon} />
              {mutation.isPending ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RolePicker({
  value,
  onChange,
  selected,
}: {
  value: string
  onChange: (value: string) => void
  selected: InviteRoleOption
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-surface-alt"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-alt">
            <HugeiconsIcon icon={UserGroupIcon} className="size-4 text-text-muted" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{selected.label}</span>
            <span className="block truncate text-xs text-text-muted">{selected.description}</span>
          </span>
        </button>
      </PopoverTrigger>
      {/* Sintaxis de Tailwind v4 para variables CSS: `w-(--var)`, no
          `w-[--var]` (que en v4 se interpreta como una propiedad arbitraria y
          no compila). Mismo patrón que select.tsx y calendar.tsx. */}
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) max-w-md p-1">
        <ul className="flex flex-col">
          {INVITE_ROLES.map((r) => {
            const isSelected = r.value === value
            // Los roles sin respaldo en la RLS se listan pero no se pueden
            // elegir: describen un permiso que el backend no aplica, y
            // ofrecerlos sería prometer una restricción inexistente. Ver
            // roles.ts para qué haría falta para habilitarlos.
            if (!r.enforced) {
              return (
                <li key={r.value}>
                  <div
                    aria-disabled="true"
                    title="Requiere control de acceso por lista — no implementado todavía."
                    className="flex cursor-default items-start gap-2 rounded-md px-2 py-2 opacity-55"
                  >
                    <HugeiconsIcon icon={UserGroupIcon} className="mt-0.5 size-4 shrink-0 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{r.label}</span>
                        <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                          Pronto
                        </span>
                      </div>
                      <p className="text-xs text-text-muted">{r.description}</p>
                    </div>
                  </div>
                </li>
              )
            }
            return (
              <li key={r.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-alt',
                    isSelected && 'bg-surface-alt',
                  )}
                >
                  <HugeiconsIcon
                    icon={UserGroupIcon}
                    className={cn('mt-0.5 size-4 shrink-0', isSelected ? 'text-accent' : 'text-text-muted')}
                  />
                  <div className="min-w-0 flex-1">
                    <span className={cn('block text-sm font-medium', isSelected && 'text-accent')}>{r.label}</span>
                    <p className="text-xs text-text-muted">{r.description}</p>
                  </div>
                  {isSelected && <HugeiconsIcon icon={Tick02Icon} className="mt-0.5 size-4 shrink-0 text-accent" />}
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
