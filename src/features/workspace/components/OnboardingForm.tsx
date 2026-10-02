import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateWorkspaceMutation } from '@/features/workspace/mutations'

export function OnboardingForm() {
  const [name, setName] = useState('')
  const mutation = useCreateWorkspaceMutation()

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate(name, {
          onError: (e) => toast.error(e instanceof Error && e.message ? e.message : 'No se pudo crear el workspace. Prueba de nuevo.'),
        })
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="workspace-name">Nombre del workspace</Label>
        <Input
          id="workspace-name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mi equipo"
        />
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        <HugeiconsIcon icon={PlusSignIcon} />
        {mutation.isPending ? 'Creando…' : 'Crear workspace'}
      </Button>
    </form>
  )
}
