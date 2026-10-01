import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AvatarDropzone } from '@/components/shared/AvatarDropzone'
import {
  useAdminUpdateProfileMutation,
  useAdminUploadAvatarMutation,
  useUpdateMemberRoleMutation,
} from '@/features/people/mutations'
import type { Person } from '@/features/people/queries'
import { INVITE_ROLES, ROLE_LABEL } from '@/features/workspace/roles'
import { initials } from '@/lib/initials'

// Editar a OTRO miembro (admin/owner): nombre/foto/cargo por
// `admin_update_profile`, rol por `update_member_role` (ambas 0071). Un
// miembro "normal" sigue editando lo suyo solo desde /profile
// (IdentitySection) — este diálogo solo lo abre PersonPanel, y solo
// cuando quien mira es admin/owner (ver ese archivo).
//
// El rol no tiene botón "Guardar" propio: aplica al toque al elegir una
// opción, mismo criterio que el checkbox de AutomationRulesDialog — es un
// cambio de un solo campo, no hay nada más que juntar con él. Nombre/
// cargo sí lo tienen (formulario de una sola pieza, como IdentitySection
// en /profile). La foto también aplica al toque al elegir un archivo.
export function EditMemberDialog({
  person,
  workspaceId,
  canChangeRole,
  open,
  onOpenChange,
}: {
  person: Person
  workspaceId: string
  /** false para la fila del dueño, la propia fila de quien edita, o la
   *  de otro administrador cuando quien edita no es el dueño
   *  (update_member_role rechaza los tres casos igual, esto solo evita
   *  ofrecer un control que va a fallar). */
  canChangeRole: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [fullName, setFullName] = useState(person.full_name ?? '')
  const [jobTitle, setJobTitle] = useState(person.job_title ?? '')

  const updateProfileMutation = useAdminUpdateProfileMutation()
  const uploadAvatarMutation = useAdminUploadAvatarMutation()
  const updateRoleMutation = useUpdateMemberRoleMutation(workspaceId)

  const dirty = fullName.trim() !== (person.full_name ?? '') || jobTitle.trim() !== (person.job_title ?? '')

  function handleAvatarFile(file: File) {
    uploadAvatarMutation.mutate({ userId: person.id, file, fullName: fullName.trim(), jobTitle: jobTitle.trim() || null })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = fullName.trim()
    if (!trimmedName) {
      toast.error('El nombre no puede quedar vacío.')
      return
    }
    updateProfileMutation.mutate(
      { userId: person.id, fullName: trimmedName, avatarUrl: person.avatar_url, jobTitle: jobTitle.trim() || null },
      { onSuccess: () => toast.success('Perfil actualizado.') },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar a {person.full_name ?? 'esta persona'}</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex items-center gap-3">
            <AvatarDropzone
              avatarUrl={person.avatar_url}
              fallbackText={initials(person.full_name || person.email)}
              uploading={uploadAvatarMutation.isPending}
              onFile={handleAvatarFile}
            />
            <span className="text-xs text-text-muted">
              {uploadAvatarMutation.isPending ? 'Subiendo…' : 'Arrastra una imagen o haz clic para cambiarla.'}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-member-name">Nombre</Label>
            <Input
              id="edit-member-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-member-job-title">Cargo</Label>
            <Input
              id="edit-member-job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Sin cargo"
            />
          </div>

          {canChangeRole ? (
            <div className="flex flex-col gap-1.5">
              <Label>Rol</Label>
              <Select
                value={person.role}
                onValueChange={(next) =>
                  updateRoleMutation.mutate(
                    { userId: person.id, role: next },
                    { onSuccess: () => toast.success('Rol actualizado.') },
                  )
                }
                disabled={updateRoleMutation.isPending}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Rol</Label>
              <p className="text-sm text-text-muted">
                {ROLE_LABEL[person.role] ?? person.role}
                {person.role === 'owner' && ' — el rol del dueño no se puede cambiar.'}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={!dirty || updateProfileMutation.isPending}>
              {updateProfileMutation.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
