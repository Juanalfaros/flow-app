import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, Image01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSession } from '@/features/auth/queries'
import { useProjects, useStatuses } from '@/features/projects/queries'
import { useCreateTaskMutation } from '@/features/tasks/mutations'
import { uploadAttachment } from '@/features/attachments/api'
import { takePendingShare, type SharedPayload } from '@/lib/share-target'
import { Skeleton } from '@/components/ui/skeleton'

interface CompartirPageProps {
  workspaceId: string
}

// Otro lado de src/sw.ts (fetch handler de Share Target) y
// src/lib/share-target.ts (el puente por IndexedDB entre los dos). Llega
// acá por un redirect del SW, nunca por navegación directa de la persona
// — por eso no hay nada que mostrar si `takePendingShare()` devuelve null
// (recarga de esta misma pestaña, o alguien tipeó la URL a mano).
export function CompartirPage({ workspaceId }: CompartirPageProps) {
  const { data: session } = useSession()
  const { data: projects } = useProjects(workspaceId)

  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'done'>('loading')
  const [shared, setShared] = useState<SharedPayload | null>(null)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string | undefined>(undefined)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const { data: statuses } = useStatuses(projectId ?? '')
  const createTaskMutation = useCreateTaskMutation(projectId ?? '')

  useEffect(() => {
    let objectUrl: string | null = null
    void takePendingShare().then((payload) => {
      if (!payload) {
        setStatus('empty')
        return
      }
      setShared(payload)
      setTitle((payload.title || payload.text || '').slice(0, 200))
      const firstImage = payload.files.find((f) => f.type.startsWith('image/'))
      if (firstImage) {
        objectUrl = URL.createObjectURL(firstImage)
        setImagePreview(objectUrl)
      }
      setStatus('ready')
    })
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  // Primer proyecto de la lista como default — mismo criterio que
  // NewFolderDialog con `parentOptions[0]`: mejor una preselección
  // razonable que un picker vacío bloqueando el submit.
  useEffect(() => {
    if (!projectId && projects?.[0]) setProjectId(projects[0].id)
  }, [projects, projectId])

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Cargando" className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-40 rounded-md" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    )
  }

  if (status === 'empty') {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-sm text-text-muted">
        No hay nada compartido pendiente. Comparte una foto o un enlace hacia Flow desde otra app para empezar
        acá.
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-8 text-success" />
        <p className="text-sm font-medium">Tarea creada.</p>
        <p className="text-xs text-text-muted">Ya puedes cerrar esta pestaña.</p>
      </div>
    )
  }

  if (!shared) return null

  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-lg font-medium">Crear tarea desde lo compartido</h1>

      {imagePreview ? (
        <img src={imagePreview} alt="" className="max-h-52 w-full rounded-md object-cover" />
      ) : shared.files.length > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm text-text-muted">
          <HugeiconsIcon icon={Image01Icon} className="size-4 shrink-0" />
          {shared.files.length} archivo{shared.files.length === 1 ? '' : 's'} adjunto
          {shared.files.length === 1 ? '' : 's'}
        </div>
      ) : null}
      {shared.url && <p className="truncate text-xs text-text-muted">{shared.url}</p>}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="compartir-title">Título</Label>
        <Input
          id="compartir-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la tarea"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="compartir-project">Lista</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger id="compartir-project" className="w-full">
            <SelectValue placeholder="Elegir lista" />
          </SelectTrigger>
          <SelectContent>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        disabled={!title.trim() || !projectId || !defaultStatus || createTaskMutation.isPending}
        onClick={() => {
          if (!defaultStatus || !projectId) return
          createTaskMutation.mutate(
            { title: title.trim(), statusId: defaultStatus.id },
            {
              onSuccess: (task) => {
                void (async () => {
                  for (const file of shared.files) {
                    if (!session?.user.id) break
                    try {
                      await uploadAttachment(task.id, file, session.user.id)
                    } catch {
                      toast.error('La tarea se creó, pero un archivo no se pudo adjuntar.')
                    }
                  }
                  setStatus('done')
                })()
              },
              onError: () => toast.error('No se pudo crear la tarea.'),
            },
          )
        }}
      >
        {createTaskMutation.isPending ? 'Creando…' : 'Crear tarea'}
      </Button>
    </div>
  )
}
