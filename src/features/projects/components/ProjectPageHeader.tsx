import type { ReactNode } from 'react'
import { EditableProjectName } from '@/features/projects/components/EditableProjectName'
import { DeleteProjectDialog } from '@/features/projects/components/DeleteProjectDialog'
import { ProjectViewPicker, ProjectViewTabs } from '@/features/projects/components/ProjectViewTabs'
import { DensityToggle } from '@/components/layout/DensityToggle'
import { Breadcrumb } from '@/features/nodes/components/Breadcrumb'
import { FavoriteButton } from '@/features/favorites/components/FavoriteButton'
import { ShareDialog } from '@/features/projects/components/ShareDialog'
import { FieldVisibilityToggles } from '@/features/tasks/components/FieldVisibilityToggles'
import { cn } from '@/lib/utils'

interface ProjectPageHeaderProps {
  projectId: string
  workspaceId: string
  projectName: string | undefined
  /** Omitido por board.tsx/list.tsx: Compacto/Etiquetas/Estados viven en
   * el toolbar (`leftActions`, ver ProjectToolbar.tsx) junto al botón de
   * crear tarea. gantt.tsx/calendar.tsx (sin ese toolbar) lo siguen
   * usando acá, en la fila de tabs. */
  actions?: ReactNode
  /** Fila de orden/filtros/búsqueda/crear — board.tsx y list.tsx. Los
   * filtros (etiqueta/asignado/prioridad) viven acá adentro, al lado del
   * botón de crear tarea, no en una fila propia (ver ProjectToolbar.tsx). */
  toolbar?: ReactNode
  /** false en board.tsx/list.tsx: el toggle se mueve al toolbar junto con
   * `actions` (ver arriba). Default true para gantt.tsx/calendar.tsx. */
  showDensityToggle?: boolean
  /** F-12: FieldVisibilityToggles (los íconos ⌗/asignado/prioridad/fecha)
   * solo tienen efecto real en Lista — TaskRow es la única fila que lee
   * `useListFieldVisibility` (ver el comentario del propio componente).
   * En Board/Calendario/Gantt/Resumen eran controles que se veían activos
   * pero no cambiaban nada ahí. Default false; list.tsx lo prende. */
  showFieldVisibilityToggles?: boolean
}

export function ProjectPageHeader({
  projectId,
  workspaceId,
  projectName,
  actions,
  toolbar,
  showDensityToggle = true,
  showFieldVisibilityToggles = false,
}: ProjectPageHeaderProps) {
  return (
    <div className="mb-2">
      {/* Todo pegado a la izquierda en una sola fila: breadcrumb, luego
          nombre/favorito/menú del proyecto justo al lado — no
          `justify-between` (eso los separaba a los extremos opuestos de
          la fila). El nombre (EditableProjectName) se ajusta a su
          contenido, no ocupa una fila propia como antes.
          Esta fila es idéntica en las 4 vistas (Board/Lista/Calendario/
          Gantt) — es el mismo proyecto, solo cambia la vista. Lo que
          varía por vista va en la fila de tabs/toolbar de abajo, nunca
          acá. FieldVisibilityToggles (los íconos de campo rápido) viven
          siempre después del "..." de DeleteProjectDialog, no antes —
          antes quedaba pegado al breadcrumb solo en Lista y esta fila se
          veía distinta según la vista. */}
      <div className="group mb-2 flex min-w-0 flex-wrap items-center gap-3">
        {/* Breadcrumb y nombre solo desde md:. En mobile los dos ya están
            en la cabecera contextual de la app — "atrás" con el nombre de
            la carpeta padre + el nombre de la lista como título fijo
            (Topbar.tsx + use-mobile-back.ts) — y repetirlos acá gastaba
            una fila entera de una pantalla donde ya había 3 de chrome
            antes de la primera tarea. Renombrar la lista queda como
            gesto de escritorio; las acciones de abajo (favorito, "⋯",
            compartir) sí siguen en mobile, que ahí no las da nadie más. */}
        <div className="hidden min-w-0 flex-wrap items-center gap-3 md:flex">
          <Breadcrumb workspaceId={workspaceId} nodeId={projectId} />
          {projectName !== undefined && (
            // key={projectId}: sin esto, cambiar de proyecto no desmonta
            // este input (misma ruta/header) — su useState sobrevivía con
            // lo que se hubiera tecleado en el proyecto anterior (B-04).
            <EditableProjectName key={projectId} projectId={projectId} name={projectName} />
          )}
        </div>
        {/* El selector de vista de mobile se SUBE a esta fila (en
            escritorio es `md:hidden` y las tabs siguen abajo). Sin él, al
            esconder breadcrumb y nombre esta franja quedaba con la estrella
            y el "⋯" pegados a la izquierda y el compartir perdido a la
            derecha, flotando sin nada que los anclara — reportado con
            captura. Así comparte fila con el chip "Board ▾" y además se
            ahorra una franja entera de alto en la pantalla más angosta.
            Ojo: el picker va acá y las tabs abajo, pero es UNA sola
            instancia de cada acción — nada duplicado. */}
        <ProjectViewPicker projectId={projectId} />
        {projectName !== undefined && (
          <div className="flex shrink-0 items-center gap-1">
            <FavoriteButton nodeId={projectId} nodeName={projectName} nodeType="project" />
            <DeleteProjectDialog projectId={projectId} projectName={projectName} />
            {/* Los íconos de campo rápido (⌗/asignado/prioridad/fecha) solo
                tienen efecto sobre columnas que en mobile TaskRow ya no
                muestra — ver el `metaVisibility` de TaskRow.tsx. */}
            {showFieldVisibilityToggles && (
              <div className="hidden md:contents">
                <FieldVisibilityToggles projectId={projectId} />
              </div>
            )}
          </div>
        )}
        {/* ml-auto (en el propio trigger de ShareDialog) lo empuja al
            extremo derecho de esta fila sin tocar el resto, que sigue
            agrupado a la izquierda. */}
        {projectName !== undefined && (
          <ShareDialog workspaceId={workspaceId} projectId={projectId} projectName={projectName} />
        )}
      </div>

      {/* En mobile las tabs son `hidden`, así que esta fila se queda solo
          con el grupo de la derecha — y cuando ese grupo tampoco existe
          (list.tsx y board.tsx pasan `showDensityToggle={false}` y ningún
          `actions`) quedaba un <div> vacío gastando su `mb-3`. */}
      <div
        className={cn(
          'mb-3 flex flex-wrap items-center justify-between gap-y-2',
          !showDensityToggle && !actions && 'hidden md:flex',
        )}
      >
        <ProjectViewTabs projectId={projectId} />
        {(showDensityToggle || actions) && (
          // flex-wrap: mismo bug que ProjectToolbar.tsx (ver su comentario) —
          // sin esto, este grupo se desborda en vez de envolver en mobile.
          <div className="flex flex-wrap items-center gap-2">
            {showDensityToggle && <DensityToggle />}
            {actions}
          </div>
        )}
      </div>

      {toolbar}
    </div>
  )
}
