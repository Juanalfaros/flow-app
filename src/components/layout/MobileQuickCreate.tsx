import { useMemo, useState } from 'react'
import { useMatchRoute, useParams } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { FormDialog } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { useShowMobileTabBar } from '@/components/layout/MobileTabBar'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useNodeTree } from '@/features/nodes/queries'
import { buildTree } from '@/features/nodes/build-tree'
import { useStatuses } from '@/features/projects/queries'
import { useCreateTaskMutation, useCreatePersonalTaskMutation } from '@/features/tasks/mutations'

/**
 * Botón flotante de crear + su hoja, solo en mobile.
 *
 * En escritorio crear una tarea siempre estuvo a mano (el "+ Tarea" del
 * toolbar de la lista, los inputs inline por columna/sección). En mobile
 * ese toolbar queda detrás de 3 filas de chrome — y desde Inicio o Mis
 * tareas directamente no había NINGÚN camino para crear algo sin entrar
 * primero a una lista. Este es el mismo atajo que el prototipo pone como
 * FAB sobre la tab bar.
 *
 * Dónde cae lo que se crea depende de dónde estás, sin preguntar:
 * dentro de una lista, en esa lista (con su estado por defecto, mismo
 * criterio que el input inline de list.tsx); en cualquier otro lado, en
 * la lista personal — el único destino que no exige elegir un proyecto
 * antes de poder escribir el título.
 */
export function MobileQuickCreate() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')

  const showTabBar = useShowMobileTabBar()
  const matchRoute = useMatchRoute()
  const params = useParams({ strict: false }) as { projectId?: string }
  const projectId = params.projectId ?? ''

  const { data: session } = useSession()
  const { workspaceId } = useCurrentWorkspace()
  const { data: treeRows } = useNodeTree(workspaceId)
  const { data: statuses } = useStatuses(projectId)
  const createInProject = useCreateTaskMutation(projectId)
  const createPersonal = useCreatePersonalTaskMutation(workspaceId, session?.user.id)

  // Mismo criterio que list.tsx para elegir el estado de una tarea nueva.
  const defaultStatus = statuses?.find((s) => s.is_default) ?? statuses?.[0]
  // `inProject` mira solo la ruta, NO si los estados ya llegaron: atándolo
  // a `defaultStatus` (que tarda un round-trip), abrir la hoja apenas se
  // entra a una lista y escribir rápido mandaba la tarea a la lista
  // personal — destino equivocado, en silencio. Ahora el destino se
  // decide por dónde estás parado y lo que falta es el estado: el botón
  // espera.
  const inProject = !!projectId
  // Memoizado: `buildTree` recorre TODOS los nodos del workspace, y este
  // componente re-renderiza en cada tecla del input del título.
  const { byId } = useMemo(() => buildTree(treeRows ?? []), [treeRows])
  const projectName = projectId ? byId.get(projectId)?.name : undefined

  // Lista explícita, no "en todos lados menos X": la app tiene una docena
  // de pantallas bajo `_app` (onboarding, perfil, equipo, archivados,
  // reportes…) donde un botón de crear una tarea no significa nada, y una
  // exclusión se olvida de la próxima que se agregue. Estas 5 son las
  // mismas donde el prototipo pone el FAB. `showTabBar` además ya deja
  // afuera el detalle de tarea a pantalla completa y el teclado abierto.
  const showFab =
    showTabBar &&
    (!!matchRoute({ to: '/' }) ||
      !!matchRoute({ to: '/mis-tareas' }) ||
      !!matchRoute({ to: '/espacios' }) ||
      !!matchRoute({ to: '/f/$folderId' }) ||
      !!matchRoute({ to: '/p/$projectId', fuzzy: true }))

  const canSubmit = !!title.trim() && (!inProject || !!defaultStatus)

  function submit() {
    const clean = title.trim()
    if (!clean) return
    if (inProject) {
      if (!defaultStatus) return
      createInProject.mutate(
        { title: clean, statusId: defaultStatus.id },
        { onError: () => toast.error('No se pudo crear la tarea.') },
      )
    } else {
      createPersonal.mutate({ title: clean })
    }
    setTitle('')
    setOpen(false)
  }

  return (
    <>
      {showFab && (
        // `fixed`, no `absolute`: el ancestro scrolleable es <main>, y
        // dentro de él el botón se iría con el scroll. Va justo encima de
        // la tab bar (pt-1 + min-h-12 + pb-1 ≈ 56px) más su zona segura.
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Nueva tarea"
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-accent-solid text-accent-foreground shadow-lg transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 md:hidden"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-6" />
        </button>
      )}

      {/* FormDialog, no el Sheet inferior que tenía antes: con el teclado
          abierto en iOS, un Sheet `side="bottom"` con el campo arriba y el
          botón "Crear tarea" al final del formulario dejaba ese botón
          tapado justo al terminar de escribir — reportado con el mismo
          síntoma en los diálogos de crear espacio/carpeta/lista. FormDialog
          resuelve el problema de raíz: pantalla completa en mobile, con
          Cancelar/Crear en una cabecera fija que el teclado nunca tapa (ver
          src/components/ui/form-dialog.tsx). Sigue siempre montado, aunque
          `showFab` sea false: enfocar el input abre el teclado, y eso apaga
          `useShowMobileTabBar` — si el diálogo dependiera de esa misma
          condición se desmontaría solo en cuanto se empieza a escribir. */}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Nueva tarea"
        submitLabel="Crear tarea"
        submitDisabled={!canSubmit}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <p className="-mt-1 text-xs text-text-muted">
          {inProject ? `En ${projectName ?? 'esta lista'}` : 'En tu lista personal'}
        </p>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la tarea…"
          // h-11: objetivo táctil real en mobile (el anti-zoom de iOS ya es
          // el default del componente, ver NewSpaceDialog.tsx).
          className="h-11 md:h-8"
        />
      </FormDialog>
    </>
  )
}
