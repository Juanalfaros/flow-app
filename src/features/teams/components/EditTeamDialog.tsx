import { useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useDeleteTeamMutation, useSetTeamMembersMutation, useUpdateTeamMutation, normalizeHandle } from '@/features/teams/mutations'
import type { TeamSummary } from '@/features/teams/queries'
import { initials } from '@/lib/initials'

interface EditTeamDialogProps {
  team: TeamSummary
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Las tres mutaciones que este diálogo usa (useUpdateTeamMutation,
// useDeleteTeamMutation, useSetTeamMembersMutation) ya existían en
// teams/mutations.ts, sin ningún consumidor — equipos.tsx solo tenía
// CreateTeamDialog. Nada de RLS/RPC nuevo, era puramente un hueco de UI
// (reportado por el usuario: "hoy no se puede, solo puedo crear el equipo").
export function EditTeamDialog({ team, workspaceId, open, onOpenChange }: EditTeamDialogProps) {
  const [name, setName] = useState(team.name)
  const [handle, setHandle] = useState(team.handle)
  const [description, setDescription] = useState(team.description ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { data: members } = useWorkspaceMembers(workspaceId)
  const updateMutation = useUpdateTeamMutation(workspaceId, team.id)
  const membersMutation = useSetTeamMembersMutation(workspaceId, team.id)
  const deleteMutation = useDeleteTeamMutation(workspaceId)

  const effectiveHandle = normalizeHandle(handle)
  const dirty =
    name.trim() !== team.name || effectiveHandle !== team.handle || description.trim() !== (team.description ?? '')
  const currentMemberIds = new Set(team.members.map((m) => m.user_id))

  function toggleMember(userId: string, isMember: boolean) {
    const nextIds = isMember
      ? [...currentMemberIds].filter((id) => id !== userId)
      : [...currentMemberIds, userId]
    membersMutation.mutate(nextIds)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar equipo</DialogTitle>
          </DialogHeader>

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim() || !effectiveHandle) return
              updateMutation.mutate(
                { name: name.trim(), handle: effectiveHandle, description },
                { onSuccess: () => toast.success('Equipo actualizado.') },
              )
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-team-name">Nombre</Label>
              <Input id="edit-team-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-team-handle">Identificador</Label>
              <Input id="edit-team-handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
              <span className="text-xs text-text-muted">Se usará @{effectiveHandle || 'handle'}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-team-description">Descripción</Label>
              <Input
                id="edit-team-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Sin descripción"
              />
            </div>
            <Button type="submit" size="sm" className="self-start" disabled={!dirty || updateMutation.isPending}>
              {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </form>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Miembros</Label>
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {members?.length === 0 && (
                <p className="text-xs text-text-muted">Sin otros miembros en el workspace.</p>
              )}
              {members?.map((m) => {
                const isMember = currentMemberIds.has(m.user_id)
                return (
                  <label
                    key={m.user_id}
                    className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-surface-alt"
                  >
                    <Checkbox checked={isMember} onCheckedChange={() => toggleMember(m.user_id, isMember)} />
                    <Avatar size="sm">
                      {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} alt="" />}
                      <AvatarFallback className="text-[10px]">{initials(m.profile?.full_name ?? null)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{m.profile?.full_name ?? m.user_id}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <Separator />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start text-danger hover:text-danger"
            onClick={() => setDeleteOpen(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} />
            Eliminar equipo
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el equipo "{team.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Las personas que lo integran no se eliminan del workspace, solo
              dejan de pertenecer a este equipo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteMutation.mutate(team.id, {
                  onSuccess: () => {
                    toast.success(`Equipo "${team.name}" eliminado.`)
                    setDeleteOpen(false)
                    onOpenChange(false)
                  },
                })
              }
            >
              {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
