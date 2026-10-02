import { useState } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useAdminOverview,
  useDeleteWorkspace,
  useInviteOwner,
  useRevokeOwnerInvitation,
  useSetOwnerQuota,
  useSetTotalLimit,
} from '@/features/admin/queries'
import type { AdminWorkspace } from '@/features/admin/api'

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function NumberField({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value))
  return (
    <Input
      aria-label={label}
      type="number"
      min={0}
      className="h-8 w-20"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft)
        if (Number.isInteger(n) && n >= 0 && n !== value) onCommit(n)
        else setDraft(String(value))
      }}
    />
  )
}

function InviteOwnerForm() {
  const [email, setEmail] = useState('')
  const [max, setMax] = useState('1')
  const invite = useInviteOwner()
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        invite.mutate({ email, max: Number(max) }, { onSuccess: () => setEmail('') })
      }}
    >
      <div className="flex min-w-64 flex-1 flex-col gap-1.5">
        <Label htmlFor="owner-email">Correo</Label>
        <Input id="owner-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="amigo@correo.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="owner-max">Workspaces permitidos</Label>
        <Input id="owner-max" type="number" min={0} required className="w-32" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <Button type="submit" disabled={invite.isPending}>
        {invite.isPending ? 'Enviando…' : 'Invitar'}
      </Button>
    </form>
  )
}

function DeleteWorkspaceDialog({ workspace, onClose }: { workspace: AdminWorkspace | null; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const del = useDeleteWorkspace()
  return (
    <AlertDialog
      open={!!workspace}
      onOpenChange={(open) => {
        if (!open) {
          setTyped('')
          onClose()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar “{workspace?.name}”</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran el workspace con todas sus tareas, comentarios y miembros. No se puede deshacer. Los archivos
            adjuntos en R2 no se eliminan con esta acción. Escribe el nombre exacto para confirmar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={workspace?.name} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!workspace || typed !== workspace.name || del.isPending}
            onClick={() => workspace && del.mutate({ id: workspace.id, name: typed })}
          >
            Eliminar definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function AdminPage() {
  const { data, isLoading } = useAdminOverview()
  const setQuota = useSetOwnerQuota()
  const setTotal = useSetTotalLimit()
  const revoke = useRevokeOwnerInvitation()
  const [toDelete, setToDelete] = useState<AdminWorkspace | null>(null)

  if (isLoading || !data) {
    return (
      <PageShell width="app">
        <p className="text-sm text-text-muted">Cargando…</p>
      </PageShell>
    )
  }

  return (
    <PageShell width="app" className="flex flex-col gap-10">
      <div>
        <h1 className="text-lg font-medium">Administración de plataforma</h1>
        <p className="text-sm text-text-secondary">
          Solo ves metadatos: nunca el contenido (tareas, comentarios, adjuntos) de los workspaces ajenos.
        </p>
      </div>

      <Section title="Invitar a un nuevo owner" hint="Recibe un correo, crea su cuenta y arma su propio workspace, aislado del tuyo.">
        <InviteOwnerForm />
        {data.invitations.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate">{i.email}</span>
                <span className="text-xs text-text-muted">pendiente · hasta {i.max_workspaces} workspace(s)</span>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(i.id)}>
                  Revocar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Límite global" hint="Máximo de workspaces en toda la instancia (protege los topes del plan gratuito).">
        <div className="flex items-center gap-3 text-sm">
          <NumberField label="Límite global de workspaces" value={data.max_total_workspaces} onCommit={(n) => setTotal.mutate(n)} />
          <span className="text-text-muted">
            {data.workspaces.length} de {data.max_total_workspaces} en uso
          </span>
        </div>
      </Section>

      <Section title="Owners" hint="Cuántos workspaces puede crear cada uno.">
        {data.owners.length === 0 ? (
          <p className="text-sm text-text-muted">Todavía no has invitado a nadie.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {data.owners.map((o) => (
              <li key={o.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate">{o.email}</span>
                <span className="flex items-center gap-2 text-xs text-text-muted">
                  {o.workspaces} creado(s) · máximo
                  <NumberField label={`Cuota de ${o.email}`} value={o.max_workspaces} onCommit={(n) => setQuota.mutate({ userId: o.user_id, max: n })} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Workspaces">
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Miembros</th>
                <th className="px-3 py-2 font-medium">Tareas</th>
                <th className="px-3 py-2 font-medium">Adjuntos</th>
                <th className="px-3 py-2 font-medium">Creado</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.workspaces.map((w) => (
                <tr key={w.id}>
                  <td className="px-3 py-2">{w.name}</td>
                  <td className="px-3 py-2 text-text-secondary">{w.owner_email ?? '—'}</td>
                  <td className="px-3 py-2">{w.members}</td>
                  <td className="px-3 py-2">{w.tasks}</td>
                  <td className="px-3 py-2">{formatBytes(w.storage_bytes)}</td>
                  <td className="px-3 py-2 text-text-secondary">{new Date(w.created_at).toLocaleDateString('es-CL')}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setToDelete(w)}>
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <DeleteWorkspaceDialog workspace={toDelete} onClose={() => setToDelete(null)} />
    </PageShell>
  )
}
