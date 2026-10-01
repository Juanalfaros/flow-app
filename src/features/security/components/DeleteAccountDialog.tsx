import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useDeleteAccountMutation } from '@/features/security/mutations'

// Escribir el correo exacto para confirmar — misma fricción deliberada
// que otras acciones destructivas del repo (borrar espacio pide el nombre
// exacto, ver NodeTreeItem.tsx). El borrado real corre en el Worker
// (Service Role, worker/account.ts); acá solo se confirma y se cierra
// sesión al terminar.
export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string
}) {
  const [confirmText, setConfirmText] = useState('')
  const navigate = useNavigate()
  const mutation = useDeleteAccountMutation()

  function handleDelete() {
    mutation.mutate(undefined, {
      onSuccess: async () => {
        toast.success('Tu cuenta fue eliminada.')
        await supabase.auth.signOut()
        onOpenChange(false)
        void navigate({ to: '/login' })
      },
      onError: () => toast.error('No se pudo eliminar la cuenta. Prueba de nuevo o contacta a un administrador.'),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmText('')
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar cuenta</DialogTitle>
          <DialogDescription>
            Es permanente y no se puede deshacer. Pierdes acceso a este workspace y a cualquier otro del que formes
            parte.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delete-account-confirm">
            Escribe <span className="font-mono">{email}</span> para confirmar
          </Label>
          <Input
            id="delete-account-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={confirmText !== email || mutation.isPending}
            onClick={handleDelete}
          >
            {mutation.isPending ? 'Eliminando…' : 'Eliminar cuenta definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
