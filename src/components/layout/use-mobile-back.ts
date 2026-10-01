import { useMemo } from 'react'
import { useParams } from '@tanstack/react-router'
import { useSession } from '@/features/auth/queries'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { useNodeTree } from '@/features/nodes/queries'
import { buildTree, getAncestors } from '@/features/nodes/build-tree'
import { useProfile } from '@/features/profile/queries'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { useLastProjectView, type ProjectViewRoute } from '@/features/projects/last-project-view'

/** Las tres formas de `<Link>` que puede tomar el "atrás" — tipadas como
 * unión discriminada (y no `{ to: string }`) para que el Link del Topbar
 * siga chequeado por el router en vez de necesitar un cast. */
export type MobileBackLink =
  | { to: '/espacios' }
  | { to: '/f/$folderId'; params: { folderId: string } }
  | { to: ProjectViewRoute; params: { projectId: string } }

export interface MobileBack {
  /** Nombre del nivel anterior REAL ("Campaña Q4", "Marketing",
   * "Espacios") — nunca un "Atrás" genérico. Mismo criterio que iOS/Asana
   * y que el prototipo móvil: el botón dice a dónde vuelve. */
  label: string
  /** Título de la pantalla actual, para la misma fila. Vacío en el detalle
   * de tarea: ahí el título va como <h1> grande en el cuerpo
   * (NodeDetailContent), repetirlo achicado en la barra no aporta. */
  title: string
  link: MobileBackLink
}

/**
 * Deriva el "atrás" de la cabecera móvil desde la RUTA, no desde un estado
 * que cada página tenga que registrar: así no hay un frame con la cabecera
 * vacía en cada navegación (lo que sí pasaría con un contexto poblado por
 * `useEffect`), ni hace falta que las páginas cooperen.
 *
 * El árbol sale del mismo `node-tree` que ya usan Sidebar y Breadcrumb
 * (mismo queryKey → TanStack Query dedupe el fetch, sin consulta nueva),
 * igual que `f.$folderId.tsx` ya hacía para su propio botón "Volver".
 *
 * Devuelve `null` en las 4 rutas raíz de la tab bar y en las pantallas de
 * "Más": ahí no hay nivel anterior — la tab bar ya dice dónde estás, y el
 * Topbar se queda con sus acciones globales de siempre.
 */
export function useMobileBack(): MobileBack | null {
  // `strict: false`: este hook vive en el layout, no dentro de una ruta
  // concreta, así que pide los params "los que haya" en vez de los de una
  // ruta en particular.
  const params = useParams({ strict: false }) as {
    folderId?: string
    projectId?: string
    taskId?: string
  }

  const { data: session } = useSession()
  const { workspaceId } = useCurrentWorkspace()
  const { data: treeRows } = useNodeTree(workspaceId)
  const { data: profile } = useProfile(session?.user.id ?? '')
  const { byId } = useMemo(() => buildTree(treeRows ?? []), [treeRows])

  // Los hooks no pueden ser condicionales: con '' devuelve el fallback y
  // no se usa para nada (solo importa en el detalle de tarea).
  const lastProjectView = useLastProjectView(params.projectId ?? '', defaultViewToRoute(profile?.default_view))

  return useMemo(() => {
    const { folderId, projectId, taskId } = params

    // Detalle de tarea a pantalla completa: vuelve a la lista, a la vista
    // que la persona estaba usando (no siempre /summary) — mismo criterio
    // que Favoritos y el árbol del sidebar.
    if (projectId && taskId) {
      return {
        label: byId.get(projectId)?.name ?? 'Lista',
        title: '',
        link: { to: lastProjectView, params: { projectId } },
      }
    }

    const nodeId = projectId ?? folderId
    if (!nodeId) return null
    // Una ruta con `projectId`/`folderId` en los params que todavía no
    // resolvió el árbol: mejor no pintar una cabecera con el nombre en
    // blanco y que "salte" cuando llegue.
    const node = byId.get(nodeId)
    if (!node) return null

    const parent = getAncestors(byId, nodeId).at(-1)
    return {
      label: parent?.name ?? 'Espacios',
      title: node.name,
      link: parent ? { to: '/f/$folderId' as const, params: { folderId: parent.id } } : { to: '/espacios' as const },
    }
    // Sin `pathname`: entre dos rutas que comparten params (ej. de
    // /p/:id/list a /p/:id/board) el resultado es el mismo — atrás a la
    // carpeta padre, título el nombre de la lista — así que no hay nada
    // que recalcular. Lo que sí distingue una pantalla de otra acá (el
    // detalle de tarea vs. la lista) es la presencia de `taskId`, que ya
    // viaja en `params`.
  }, [params, byId, lastProjectView])
}
