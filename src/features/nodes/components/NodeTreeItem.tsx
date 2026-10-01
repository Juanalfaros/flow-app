import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckListIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Folder02Icon,
  MoreHorizontalIcon,
  PlusSignIcon,
  Delete02Icon,
  Edit02Icon,
  FolderAddIcon,
  PaintBoardIcon,
  StarIcon,
  Link01Icon,
  FlashIcon,
  Table01Icon,
  Flag01Icon,
  Download01Icon,
  Copy02Icon,
  ViewOffIcon,
  Archive01Icon,
  LockIcon,
  Globe02Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DragHandle } from '@/components/ui/drag-handle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import type { TreeNode } from '@/features/nodes/build-tree'
import type { NodeType } from '@/features/nodes/types'
import { getNodeAppearance } from '@/features/nodes/types'
import { useArchiveNodeMutation, useDeleteFolderMutation, useRenameFolderMutation } from '@/features/nodes/mutations'
import { NewFolderDialog } from '@/features/nodes/components/NewFolderDialog'
import { NewProjectDialog } from '@/features/projects/components/NewProjectDialog'
import { SpaceIconDialog } from '@/features/nodes/components/SpaceIconDialog'
import { NodeAccessDialog } from '@/features/sharing/components/NodeAccessDialog'
import { DuplicateSpaceDialog } from '@/features/nodes/components/DuplicateSpaceDialog'
import { StatusSettingsDialog } from '@/features/projects/components/StatusSettingsDialog'
import { CustomFieldDefinitionDialog } from '@/features/custom-fields/components/CustomFieldDefinitionDialog'
import { AutomationRulesDialog } from '@/features/automations/components/AutomationRulesDialog'
import { SpaceImportDialog } from '@/features/tasks/components/SpaceImportDialog'
import { NodeIconSwatch } from '@/features/nodes/components/NodeIconSwatch'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { defaultViewToRoute } from '@/features/profile/default-view'
import { useIsFavorited } from '@/features/favorites/queries'
import { useToggleFavoriteMutation } from '@/features/favorites/mutations'
import { useToggleHiddenNodeMutation } from '@/features/hidden-nodes/mutations'
import { useLastProjectView } from '@/features/projects/last-project-view'
import { cn } from '@/lib/utils'

// 2026-09-10: el menú de espacio ya no tiene ningún ítem "Pronto" —
// Automatizaciones/Importaciones (0074_space_level_automations.sql) y
// Campos personalizados/Estados de tarea (0073_space_level_fields.sql)
// fueron los últimos cuatro, todos reusando el diálogo per-proyecto de
// siempre con `scope="space"` (StatusSettingsDialog/
// CustomFieldDefinitionDialog/AutomationRulesDialog) o un atajo dedicado
// (SpaceImportDialog, para el caso de Importaciones — ver ese archivo
// para por qué no es una regla persistente como las demás). Antes de
// eso habían salido "Etiquetas" (ya son por workspace entero, no hay
// nada de "por espacio" que prometer) y "Plantillas" (F5 #8 ya la
// resolvió a nivel de tarea/lista, página propia en /plantillas). El
// antiguo mock "Uso compartido y permisos" se borró (S-05): era el
// mismo NodeAccessDialog que ya abre "Acceso y privacidad" más arriba,
// duplicado. El helper `MockMenuItem` que renderizaba estos placeholders
// (disabled nativo + badge "Pronto") se borró con el último de sus usos.

interface NodeTreeItemProps {
  node: TreeNode
  depth: number
  workspaceId: string
  // S-03/S-09/S-10: un solo id de nodo activo (proyecto O carpeta/espacio,
  // según la ruta actual — ver Sidebar.tsx) en vez de solo `activeProjectId`,
  // que nunca podía coincidir estando parado en /f/$folderId.
  activeNodeId?: string
  isExpanded: (id: string, type: NodeType) => boolean
  onToggle: (id: string) => void
  onNavigate?: () => void
}

export function NodeTreeItem({
  node,
  depth,
  workspaceId,
  activeNodeId,
  isExpanded,
  onToggle,
  onNavigate,
}: NodeTreeItemProps) {
  // Se adelanta acá (antes vivía más abajo, junto a isFavorited) porque
  // useLastProjectView ahora necesita el `default_view` de la cuenta para
  // su fallback — ver el comentario de esa llamada.
  const { data: session } = useSession()
  // S-03: el árbol navegaba siempre a /summary — se recuerda la última
  // vista visitada de este proyecto (Board, Lista, etc.) y se navega ahí.
  // Si todavía no hay una recordada, cae en la vista por defecto de la
  // cuenta (Preferencias, 0058_profile_preferences.sql) antes que /summary.
  const { data: preferenceProfile } = useProfile(session?.user.id ?? '')
  const lastView = useLastProjectView(node.id, defaultViewToRoute(preferenceProfile?.default_view))
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // F-01: un espacio borra en cascada subcarpetas, listas y todas sus
  // tareas — el mismo "Cancelar/Eliminar todo" que ya alcanza para una
  // carpeta se queda corto acá, así que además hay que escribir el
  // nombre exacto. (Folder/lista con contenido: mismo criterio pendiente
  // para F-06, ver plan.)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [iconDialogOpen, setIconDialogOpen] = useState(false)
  const [accessDialogOpen, setAccessDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [spaceStatusesOpen, setSpaceStatusesOpen] = useState(false)
  const [spaceCustomFieldsOpen, setSpaceCustomFieldsOpen] = useState(false)
  const [spaceAutomationsOpen, setSpaceAutomationsOpen] = useState(false)
  const [spaceImportOpen, setSpaceImportOpen] = useState(false)
  const renameMutation = useRenameFolderMutation(workspaceId)
  const deleteMutation = useDeleteFolderMutation(workspaceId)
  const archiveMutation = useArchiveNodeMutation(workspaceId)
  // S-15: "Favorito" y "Copiar enlace" del menú de espacio eran mocks
  // "Pronto" aunque ambos ya tenían todo lo necesario para funcionar de
  // verdad — el toggle de favoritos no distingue por tipo de nodo (ver
  // favorites/mutations.ts) y useFavoriteProjects ahora también trae
  // espacios/carpetas (favorites/queries.ts). Los hooks van antes del
  // `return` temprano de más abajo (fila de proyecto) para no violar las
  // reglas de hooks, igual que renameMutation/deleteMutation.
  const isFavorited = useIsFavorited(session?.user.id, node.id)
  const toggleFavoriteMutation = useToggleFavoriteMutation(session?.user.id)
  const hideNodeMutation = useToggleHiddenNodeMutation(session?.user.id)

  const indentStyle = { paddingLeft: 6 + depth * 14 }

  // Los spaces son la raíz del árbol y no se reparentan — solo folder/
  // project son arrastrables. Solo space/folder aceptan soltar encima
  // (project es hoja, no puede contener hijos).
  const isDraggable = node.type !== 'space'
  const isDroppable = node.type === 'space' || node.type === 'folder'
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id: node.id, disabled: !isDraggable })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: node.id, disabled: !isDroppable })

  if (node.type === 'project') {
    return (
      <li
        ref={setDragRef}
        // Sidebar.tsx lo usa para hacer scroll hasta acá cuando esta fila
        // es la activa (auditoría de navegación, 2026-09-14).
        data-node-id={node.id}
        role="treeitem"
        aria-level={depth + 1}
        style={{ transform: CSS.Translate.toString(transform) }}
        // `pointer-events-none` mientras se arrastra: el transform de arriba
        // sigue al cursor, así que el <a> queda pintado justo debajo del
        // mouse al soltar — sin esto, el mouseup del drop hace hit-test
        // sobre el propio link (no sobre la fila destino), el browser
        // sintetiza un click ahí, y el <Link> navega + hace un reload
        // completo de la página en vez de un reparent normal (bug real
        // encontrado probando en navegador: arrastrar una lista a otra
        // carpeta recargaba todo). `draggable={false}` en el <Link> de
        // abajo evita además el drag-and-drop nativo del browser sobre el
        // <a> (mecanismo aparte, coexiste con el de dnd-kit).
        className={cn('relative', isDragging && 'pointer-events-none opacity-40')}
      >
        {/* Las filas de space/folder ya exponen `dragAttributes` en su botón
            de expandir/colapsar, así que el KeyboardSensor (ver Sidebar.tsx)
            las alcanza. La fila de proyecto no tiene ese botón —es un <Link>
            a secas— y las `attributes` no pueden ir ahí sin robarle el
            Enter, así que el handle va aparte. */}
        <DragHandle
          attributes={dragAttributes}
          listeners={dragListeners}
          label={`Mover lista: ${node.name}`}
        />
        <Link
          to={lastView}
          params={{ projectId: node.id }}
          onClick={onNavigate}
          style={indentStyle}
          draggable={false}
          // Solo `listeners`, sin `attributes`: éstas agregan role="button"/
          // tabIndex al wrapper y crean un segundo tab-stop delante del
          // propio Link, capturando el foco/Enter (mismo motivo que
          // DraggableTaskCard.tsx). El PointerSensor con distancia mínima
          // (ver Sidebar.tsx) deja que el click normal siga navegando.
          {...dragListeners}
          className={cn(
            'flex items-center gap-1.5 truncate rounded-md py-1.5 pr-2 text-sm hover:bg-surface-alt',
            // Mismo indicador "activo" que el resto del sidebar (Sidebar.tsx:
            // activeNavItemClass): solo color, sin fondo ni borde.
            activeNodeId === node.id && 'font-medium text-accent',
          )}
        >
          <HugeiconsIcon
            icon={CheckListIcon}
            className={cn('size-3.5 shrink-0', activeNodeId === node.id ? 'text-accent' : 'text-text-muted')}
          />
          <span className="truncate">{node.name}</span>
        </Link>
      </li>
    )
  }

  const expanded = isExpanded(node.id, node.type)
  const isFolder = node.type === 'folder'
  const isSpace = node.type === 'space'
  const appearance = getNodeAppearance(node.custom_fields)
  const kindLabel = isSpace ? 'espacio' : 'carpeta'

  function submitRename() {
    const title = renameValue.trim()
    if (!title || title === node.name) {
      setRenaming(false)
      setRenameValue(node.name)
      return
    }
    renameMutation.mutate(
      { folderId: node.id, title },
      { onError: () => toast.error(`No se pudo renombrar la ${kindLabel}.`) },
    )
    setRenaming(false)
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/f/${node.id}`)
      toast.success('Enlace copiado.')
    } catch {
      toast.error('No se pudo copiar el enlace.')
    }
  }

  return (
    // A-03: aria-expanded acá (no solo en el botón de adentro) — el patrón
    // ARIA tree lo espera en el propio treeitem, que es lo que un lector de
    // pantalla anuncia al enfocar la fila.
    <li role="treeitem" aria-level={depth + 1} aria-expanded={expanded} data-node-id={node.id}>
      <div
        ref={(el) => {
          setDragRef(el)
          setDropRef(el)
        }}
        style={{ ...indentStyle, transform: CSS.Translate.toString(transform) }}
        // `pointer-events-none` mientras se arrastra: mismo motivo que en
        // la fila de proyecto — el transform sigue al cursor, así que sin
        // esto el mouseup del drop cae sobre la propia fila arrastrada
        // (dispara un toggle espurio) en vez de sobre la fila destino.
        className={cn(
          'flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-surface-alt',
          isDragging && 'pointer-events-none opacity-40',
          isOver && 'bg-accent/10 ring-1 ring-inset ring-accent',
        )}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          aria-label={`${expanded ? 'Contraer' : 'Expandir'} ${node.name}`}
          aria-expanded={expanded}
          {...(isDraggable ? dragAttributes : {})}
          {...dragListeners}
          // `p-1` (antes sin padding, A-01): el único contenido era el
          // ícono de 12px, sin nombre accesible ni blanco de toque —
          // ~12px de área tappable, la mitad del mínimo recomendado (24px)
          // y es el control principal del árbol en el Sheet móvil.
          className="flex shrink-0 items-center gap-1 p-1 text-xs font-medium text-text-muted uppercase"
        >
          <HugeiconsIcon icon={expanded ? ChevronDownIcon : ChevronRightIcon} className="size-3" />
        </button>
        {isFolder && <HugeiconsIcon icon={Folder02Icon} className="size-3.5 shrink-0 text-text-muted" />}
        {isSpace && <NodeIconSwatch name={node.name} appearance={appearance} />}
        {/* El candado va en la fila y no solo dentro del menú: que un
            espacio o carpeta sea privado es información que conviene ver
            de un vistazo, sobre todo antes de mover algo dentro. */}
        {(isSpace || isFolder) && node.is_private && (
          // El title va en el <span> y no en HugeiconsIcon, que no acepta esa
          // prop — así el tooltip nativo sigue funcionando.
          <span title={isSpace ? 'Espacio privado' : 'Carpeta privada'} className="flex shrink-0 items-center">
            <HugeiconsIcon icon={LockIcon} className="size-3 text-text-muted" />
            <span className="sr-only">{isSpace ? 'Espacio privado' : 'Carpeta privada'}</span>
          </span>
        )}
        {renaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename()
              if (e.key === 'Escape') {
                setRenaming(false)
                setRenameValue(node.name)
              }
            }}
            className="h-6 flex-1 px-1 text-xs"
          />
        ) : (
          // La flecha (arriba) sigue togglenado el árbol — el nombre pasa a
          // ser un <Link> a la vista de carpeta/espacio, mismo patrón que ya
          // tiene la fila de proyecto más abajo. Antes ambos llamaban a
          // onToggle: una sola zona, un solo comportamiento posible.
          <Link
            to="/f/$folderId"
            params={{ folderId: node.id }}
            onClick={onNavigate}
            {...dragListeners}
            className={cn(
              'flex-1 truncate text-left hover:underline',
              // S-10: mayúsculas/12px quedan reservadas a espacios
              // (profundidad 0, leen como título de sección) — una carpeta es
              // un nivel más de contenido normal, como un proyecto, y baja a
              // caja normal; el ícono de la izquierda ya la distingue de un
              // proyecto sin necesitar tipografía aparte.
              isSpace ? 'text-xs font-medium text-text-muted uppercase' : 'text-sm text-text-muted',
              activeNodeId === node.id && 'font-medium text-accent',
            )}
          >
            {node.name}
          </Link>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Más opciones de "${node.name}"`}>
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {isSpace && (
              <>
                <DropdownMenuItem
                  disabled={!session?.user.id}
                  onSelect={() =>
                    toggleFavoriteMutation.mutate(
                      { nodeId: node.id, nodeName: node.name, nodeType: node.type, isFavorited },
                      { onError: () => toast.error('No se pudo actualizar favoritos.') },
                    )
                  }
                >
                  <HugeiconsIcon icon={StarIcon} className={cn(isFavorited && 'fill-accent-2 text-accent-2')} />
                  {isFavorited ? 'Quitar de favoritos' : 'Favorito'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  <HugeiconsIcon icon={Edit02Icon} />
                  Cambiar nombre
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleCopyLink}>
                  <HugeiconsIcon icon={Link01Icon} />
                  Copiar enlace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => setNewFolderOpen(true)}>
              <HugeiconsIcon icon={FolderAddIcon} />
              Nueva carpeta
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setNewProjectOpen(true)}>
              <HugeiconsIcon icon={PlusSignIcon} />
              Nueva lista
            </DropdownMenuItem>
            {isSpace && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setIconDialogOpen(true)}>
                  <HugeiconsIcon icon={PaintBoardIcon} />
                  Color e ícono
                </DropdownMenuItem>
                {/* Deja de ser un "Pronto": el acceso por espacio ya existe
                    (0028-0031). El candado en la fila de arriba refleja el
                    estado sin tener que abrir el menú. */}
                <DropdownMenuItem onSelect={() => setAccessDialogOpen(true)}>
                  <HugeiconsIcon icon={node.is_private ? LockIcon : Globe02Icon} />
                  Acceso y privacidad
                </DropdownMenuItem>
                {/* Automatizaciones de espacio: reglas que disparan solas en
                    CUALQUIER lista del espacio (0074_space_level_automations.sql),
                    no solo un atajo de UI — necesitaba que existieran
                    Estados de espacio primero (notify_on_status/
                    label_on_status matchean por NOMBRE de estado contra
                    la plantilla del espacio, porque cada lista tiene su
                    propia copia con su propio id). */}
                <DropdownMenuItem onSelect={() => setSpaceAutomationsOpen(true)}>
                  <HugeiconsIcon icon={FlashIcon} />
                  Automatizaciones
                </DropdownMenuItem>
                {/* "Campos personalizados"/"Estados de tarea" ACÁ significa
                    compartirlos entre varias listas de un mismo espacio —
                    distinto de lo que F5 #7 ya construyó (por lista
                    individual, ver CustomFieldDefinitionDialog en
                    ProjectToolbar.tsx / StatusSettingsDialog.tsx). Mismo
                    componente en los dos casos (`scope="space"` cambia el
                    título y usa el id del espacio como `projectId` — ver
                    0073_space_level_fields.sql, que reusa las mismas
                    tablas `statuses`/`project_custom_fields`). Herencia
                    automática: una lista nueva creada acá adentro arranca
                    con una copia de lo que se configure en estos dos
                    diálogos; no afecta retroactivamente a las que ya
                    existen. */}
                <DropdownMenuItem onSelect={() => setSpaceCustomFieldsOpen(true)}>
                  <HugeiconsIcon icon={Table01Icon} />
                  Campos personalizados de espacio
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSpaceStatusesOpen(true)}>
                  <HugeiconsIcon icon={Flag01Icon} />
                  Estados de tarea de espacio
                </DropdownMenuItem>
                {/* "Etiquetas" salió de acá: ya son por workspace entero
                    (0001_init.sql, tabla `labels`), no por lista — no hay
                    nada de "por espacio" que prometer. */}
                {/* Importar CSV es una acción de una sola vez sobre un
                    lote de filas, no una regla persistente como
                    Automatizaciones — no hay nada "de espacio" que
                    aplique solo de forma continua. Atajo a propósito:
                    elegir a cuál lista del espacio importar sin salir de
                    este menú (ver SpaceImportDialog.tsx). */}
                <DropdownMenuItem onSelect={() => setSpaceImportOpen(true)}>
                  <HugeiconsIcon icon={Download01Icon} />
                  Importaciones
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Sin toggle acá: al ocultar, la fila desaparece del árbol
                    en el mismo render (Sidebar.tsx filtra por
                    useHiddenNodeIds antes de buildHierarchy), así que este
                    ítem nunca queda "activo" para poder revertirlo desde el
                    mismo menú. Deshacerlo vive en "Espacios ocultos" del
                    footer del sidebar. */}
                <DropdownMenuItem
                  disabled={!session?.user.id}
                  onSelect={() =>
                    hideNodeMutation.mutate(
                      { nodeId: node.id, isHidden: false, nodeName: node.name, nodeType: node.type },
                      { onError: () => toast.error('No se pudo ocultar el espacio.') },
                    )
                  }
                >
                  <HugeiconsIcon icon={ViewOffIcon} />
                  Ocultar espacio
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDuplicateDialogOpen(true)}>
                  <HugeiconsIcon icon={Copy02Icon} />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    archiveMutation.mutate(node.id, {
                      onError: () => toast.error('No se pudo archivar el espacio.'),
                    })
                  }
                >
                  <HugeiconsIcon icon={Archive01Icon} />
                  Archivar
                </DropdownMenuItem>
              </>
            )}
            {isFolder && (
              <>
                <DropdownMenuSeparator />
                {/* Mismo diálogo que ya usa el espacio (Fase A de
                    "privacidad de tareas y espacios") — el modelo de acceso
                    (is_private + node_access) nunca estuvo restringido a
                    nivel de columna, solo faltaba conectar el botón acá. */}
                <DropdownMenuItem onSelect={() => setAccessDialogOpen(true)}>
                  <HugeiconsIcon icon={node.is_private ? LockIcon : Globe02Icon} />
                  Acceso y privacidad
                </DropdownMenuItem>
                {/* "Archivar" vivía solo en el menú de un espacio — el
                    backend (archive_node, 0061/0067) siempre fue genérico
                    por nodeId, sin restricción de tipo. Reportado por el
                    usuario ("¿por qué no carpetas y listas?"). */}
                <DropdownMenuItem
                  onSelect={() =>
                    archiveMutation.mutate(node.id, {
                      onError: () => toast.error('No se pudo archivar la carpeta.'),
                    })
                  }
                >
                  <HugeiconsIcon icon={Archive01Icon} />
                  Archivar
                </DropdownMenuItem>
              </>
            )}
            {(isFolder || isSpace) && (
              <>
                <DropdownMenuSeparator />
                {isFolder && (
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    <HugeiconsIcon icon={Edit02Icon} />
                    Renombrar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <HugeiconsIcon icon={Delete02Icon} />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <ul role="group" className="flex flex-col gap-0.5">
          {node.children.length === 0 && (
            <li style={{ paddingLeft: 6 + (depth + 1) * 14 }} className="py-1 text-xs text-text-muted">
              Vacío.
            </li>
          )}
          {node.children.map((child) => (
            <NodeTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              workspaceId={workspaceId}
              activeNodeId={activeNodeId}
              isExpanded={isExpanded}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}

      <NewFolderDialog workspaceId={workspaceId} parentId={node.id} open={newFolderOpen} onOpenChange={setNewFolderOpen} />
      <NewProjectDialog
        workspaceId={workspaceId}
        trigger="none"
        defaultParentId={node.id}
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
      />

      {(isFolder || isSpace) && (
        <AlertDialog
          open={deleteOpen}
          onOpenChange={(next) => {
            setDeleteOpen(next)
            if (!next) setDeleteConfirmText('')
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar "{node.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Se elimina {isSpace ? 'el espacio' : 'la carpeta'} con todo su contenido: subcarpetas, listas y sus
                tareas. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* Un espacio es la cascada más grande del árbol — a diferencia
                de una carpeta, puede llevarse por delante varias listas
                enteras. Escribir el nombre exacto es la misma fricción a
                propósito que ya usa, por ejemplo, borrar un repo en GitHub. */}
            {isSpace && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`delete-confirm-${node.id}`} className="text-xs text-text-muted">
                  Escribe <span className="font-medium text-text">{node.name}</span> para confirmar.
                </Label>
                <Input
                  id={`delete-confirm-${node.id}`}
                  autoFocus
                  autoComplete="off"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleteMutation.isPending || (isSpace && deleteConfirmText !== node.name)}
                onClick={() => {
                  deleteMutation.mutate(node.id, {
                    onError: () => toast.error(`No se pudo eliminar la ${kindLabel}.`),
                  })
                  setDeleteOpen(false)
                  setDeleteConfirmText('')
                }}
              >
                Eliminar todo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isSpace && (
        <SpaceIconDialog
          workspaceId={workspaceId}
          nodeId={node.id}
          nodeName={node.name}
          appearance={appearance}
          open={iconDialogOpen}
          onOpenChange={setIconDialogOpen}
        />
      )}

      {(isSpace || isFolder) && accessDialogOpen && (
        // Montado solo cuando está abierto: sus queries (accesos del nodo,
        // personas, equipos) no deben dispararse por cada fila del árbol.
        <NodeAccessDialog
          nodeId={node.id}
          nodeName={node.name}
          kind={isSpace ? 'space' : 'folder'}
          isPrivate={node.is_private}
          open={accessDialogOpen}
          onOpenChange={setAccessDialogOpen}
        />
      )}

      {isSpace && duplicateDialogOpen && (
        <DuplicateSpaceDialog
          workspaceId={workspaceId}
          spaceId={node.id}
          spaceName={node.name}
          open={duplicateDialogOpen}
          onOpenChange={setDuplicateDialogOpen}
        />
      )}

      {isSpace && spaceStatusesOpen && (
        <StatusSettingsDialog
          projectId={node.id}
          scope="space"
          open={spaceStatusesOpen}
          onOpenChange={setSpaceStatusesOpen}
        />
      )}

      {isSpace && spaceCustomFieldsOpen && (
        <CustomFieldDefinitionDialog
          projectId={node.id}
          scope="space"
          open={spaceCustomFieldsOpen}
          onOpenChange={setSpaceCustomFieldsOpen}
        />
      )}

      {isSpace && spaceAutomationsOpen && (
        <AutomationRulesDialog
          projectId={node.id}
          workspaceId={workspaceId}
          scope="space"
          open={spaceAutomationsOpen}
          onOpenChange={setSpaceAutomationsOpen}
        />
      )}

      {isSpace && spaceImportOpen && (
        <SpaceImportDialog
          spaceNode={node}
          workspaceId={workspaceId}
          open={spaceImportOpen}
          onOpenChange={setSpaceImportOpen}
        />
      )}
    </li>
  )
}
