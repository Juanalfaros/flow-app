import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { HierarchySquare01Icon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentWorkspace } from '@/features/workspace/queries'
import { usePeople, type Person } from '@/features/people/queries'
import { useSetManagerMutation } from '@/features/people/mutations'
import { useSetPersonSearchParam } from '@/features/people/person-param'
import { useEquipoWideLayout } from '@/features/people/use-equipo-wide-layout'
import { buildHierarchy, type TreeOf } from '@/lib/hierarchy'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_app/equipo/organigrama')({
  component: OrganigramaPage,
})

type OrgPerson = TreeOf<Person & { parent_id: string | null }>
type ViewMode = 'arbol' | 'lista'

function OrganigramaPage() {
  const { workspaceId, role } = useCurrentWorkspace()
  const { data: people, isPending } = usePeople(workspaceId)
  const isAdmin = role === 'owner' || role === 'admin'

  // `manager_id` es exactamente la misma forma de jerarquía que `parent_id` en
  // el árbol de nodos, así que se reusa `buildHierarchy` (lib/hierarchy.ts) en
  // vez de escribir un segundo recorrido. Quien no tiene gestor queda como
  // raíz, igual que un espacio sin padre.
  const { roots } = useMemo(
    () => buildHierarchy((people ?? []).map((p) => ({ ...p, parent_id: p.manager_id }))),
    [people],
  )

  // Corrección 5 de la maqueta de Equipo: "Sin gestor" separa a quien
  // está genuinamente huérfano (sin gestor Y sin nadie a cargo, no
  // aparece en ninguna rama) de quien es raíz legítima de una rama
  // (sin gestor pero con gente reportándole — Dirección, o la cabeza de
  // cada rama). No hay una columna "es director" en la base: esta es la
  // única señal que distingue las dos cosas sin inventar un campo nuevo.
  const orgRoots = roots.filter((r) => r.children.length > 0)
  const orphans = roots.filter((r) => r.children.length === 0)

  // Desde @min-[1100px] de contenido (1420px de ventana, mismo umbral que
  // el split-pane de la ficha — ver use-equipo-wide-layout.ts) el árbol
  // entra cómodo; por default se usa esa señal, pero con un toggle manual
  // (mismo patrón que "Filas/Tarjetas" en Personas) para quien prefiera
  // la lista anidada aun con espacio de sobra — es la vista accesible por
  // teclado/lector de pantalla que el código ya documentaba, no algo que
  // deba desaparecer solo porque la ventana es ancha.
  const wide = useEquipoWideLayout()
  const [manualView, setManualView] = useState<ViewMode | null>(null)
  const view = manualView ?? (wide ? 'arbol' : 'lista')

  if (isPending) {
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <Skeleton className="h-16 w-64 rounded-card" />
        <Skeleton className="h-16 w-64 rounded-card" />
      </div>
    )
  }

  if ((people ?? []).length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 p-12 text-center">
        <HugeiconsIcon icon={HierarchySquare01Icon} className="size-5 text-text-muted/60" />
        <p className="text-sm text-text-muted">Todavía no hay nadie en el workspace.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          {isAdmin
            ? 'Asigna a quién reporta cada persona para construir el organigrama.'
            : 'Solo un administrador puede cambiar la cadena de reporte.'}
        </p>
        <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
          {(['arbol', 'lista'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setManualView(mode)}
              aria-label={mode === 'arbol' ? 'Ver como árbol' : 'Ver como lista'}
              aria-pressed={view === mode}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                view === mode ? 'bg-surface-alt text-text' : 'text-text-muted hover:text-text',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {view === 'arbol' ? (
        <OrgTree orgRoots={orgRoots} orphans={orphans} people={people ?? []} isAdmin={isAdmin} />
      ) : (
        <ul className="flex flex-col gap-2">
          {roots.map((node) => (
            <OrgNode key={node.id} node={node} people={people ?? []} isAdmin={isAdmin} depth={0} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Vista de árbol por niveles — mismo dato que la lista anidada, dibujado
 * como columnas (una por profundidad) en vez de indentación. Sin
 * conectores SVG entre tarjetas (simplificación deliberada frente a la
 * maqueta): cada columna ya dice a qué nivel pertenece, y el color de
 * acento + el borde punteado de "Sin gestor" bastan para leer la
 * estructura sin dibujar líneas.
 */
function OrgTree({
  orgRoots,
  orphans,
  people,
  isAdmin,
}: {
  orgRoots: OrgPerson[]
  orphans: OrgPerson[]
  people: Person[]
  isAdmin: boolean
}) {
  const levels = useMemo(() => groupByLevel(orgRoots), [orgRoots])

  return (
    <div className="flex items-start gap-6 overflow-x-auto pb-2">
      {levels.map(({ depth, nodes }) => (
        <div key={depth} className="flex w-56 shrink-0 flex-col gap-2">
          <span className="font-mono text-[10.5px] tracking-wide text-text-muted uppercase">
            {depth === 0 ? 'Dirección' : `Nivel ${depth + 1}`}
          </span>
          {nodes.map((node) => (
            <OrgTreeCard key={node.id} node={node} people={people} isAdmin={isAdmin} root={depth === 0} />
          ))}
        </div>
      ))}

      {orphans.length > 0 && (
        <div className="flex w-56 shrink-0 flex-col gap-2">
          <span className="font-mono text-[10.5px] tracking-wide text-text-muted uppercase">Sin gestor</span>
          {orphans.map((node) => (
            <OrgTreeCard key={node.id} node={node} people={people} isAdmin={isAdmin} orphan />
          ))}
        </div>
      )}
    </div>
  )
}

/** Recorrido por niveles (BFS): agrupa TODAS las raíces con reportes en
 * columnas por profundidad, mezclando ramas distintas en el mismo nivel
 * — dos jefes de área en el tope de la empresa comparten la columna
 * "Dirección" en vez de abrir dos árboles separados uno al lado del otro. */
function groupByLevel(orgRoots: OrgPerson[]): { depth: number; nodes: OrgPerson[] }[] {
  const byDepth = new Map<number, OrgPerson[]>()
  let frontier = orgRoots
  let depth = 0
  while (frontier.length > 0) {
    byDepth.set(depth, frontier)
    frontier = frontier.flatMap((n) => n.children)
    depth += 1
  }
  return [...byDepth.entries()].map(([d, nodes]) => ({ depth: d, nodes }))
}

function OrgTreeCard({
  node,
  people,
  isAdmin,
  root,
  orphan,
}: {
  node: OrgPerson
  people: Person[]
  isAdmin: boolean
  root?: boolean
  orphan?: boolean
}) {
  const { workspaceId } = useCurrentWorkspace()
  const setPerson = useSetPersonSearchParam()
  const setManager = useSetManagerMutation(workspaceId)
  const descendantIds = useMemo(() => collectIds(node), [node])

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-card border bg-surface p-2.5 shadow-card',
        root ? 'border-accent' : orphan ? 'border-dashed border-warn' : 'border-border',
      )}
    >
      <button type="button" onClick={() => setPerson(node.id)} className="flex min-w-0 items-center gap-2 text-left">
        <Avatar size="sm">
          {node.avatar_url && <AvatarImage src={node.avatar_url} alt="" />}
          <AvatarFallback>{initials(node.full_name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium">{node.full_name ?? 'Sin nombre todavía'}</span>
          <span className="block truncate text-[10.5px] text-text-muted">
            {node.job_title ?? (node.children.length > 0 ? `${node.children.length} persona${node.children.length === 1 ? '' : 's'}` : 'Sin asignar')}
          </span>
        </span>
      </button>
      {isAdmin && (
        <Select
          value={node.manager_id ?? 'none'}
          onValueChange={(v) => setManager.mutate({ userId: node.id, managerId: v === 'none' ? null : v })}
        >
          <SelectTrigger size="sm" className="h-7 text-xs" aria-label={`Gestor de ${node.full_name ?? 'esta persona'}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin gestor</SelectItem>
            {people
              .filter((p) => !descendantIds.has(p.id))
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name ?? p.email}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

/**
 * Una rama del organigrama, como lista anidada.
 *
 * Se dibuja como lista anidada con indentación y no como el diagrama de cajas
 * de la referencia: una lista es navegable con teclado y lector de pantalla sin
 * trabajo extra, se lee bien en móvil, y no necesita cálculo de posiciones ni
 * zoom. Por debajo de @min-[1100px], o con el toggle manual, sigue siendo la
 * vista por defecto — la de árbol (arriba) es la alternativa desde ese ancho.
 */
function OrgNode({
  node,
  people,
  isAdmin,
  depth,
}: {
  node: TreeOf<Person & { parent_id: string | null }>
  people: Person[]
  isAdmin: boolean
  depth: number
}) {
  const { workspaceId } = useCurrentWorkspace()
  const setPerson = useSetPersonSearchParam()
  const setManager = useSetManagerMutation(workspaceId)

  // No se puede elegir como gestor a alguien de la propia descendencia: la
  // base lo rechaza igual (`manager_would_create_cycle` en 0024), pero
  // ofrecerlo y que falle sería peor UX que no ofrecerlo.
  const descendantIds = useMemo(() => collectIds(node), [node])

  return (
    <li style={{ marginLeft: depth === 0 ? 0 : 20 }}>
      <div className="flex items-center gap-2 rounded-card border border-border bg-surface p-2.5 shadow-card">
        <button
          type="button"
          onClick={() => setPerson(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Avatar size="sm">
            {node.avatar_url && <AvatarImage src={node.avatar_url} alt="" />}
            <AvatarFallback>{initials(node.full_name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{node.full_name ?? 'Sin nombre todavía'}</span>
            <span className="block truncate text-xs text-text-muted">
              {node.job_title ?? <span className="italic">Sin cargo</span>}
            </span>
          </span>
        </button>

        {isAdmin && (
          <Select
            value={node.manager_id ?? 'none'}
            onValueChange={(v) => setManager.mutate({ userId: node.id, managerId: v === 'none' ? null : v })}
          >
            <SelectTrigger size="sm" aria-label={`Gestor de ${node.full_name ?? 'esta persona'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin gestor</SelectItem>
              {people
                .filter((p) => !descendantIds.has(p.id))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {node.children.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 border-l border-border pl-2">
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} people={people} isAdmin={isAdmin} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** El nodo y toda su descendencia — quienes no pueden ser su gestor. */
function collectIds(node: TreeOf<Person & { parent_id: string | null }>): Set<string> {
  const ids = new Set<string>([node.id])
  for (const child of node.children) {
    for (const id of collectIds(child)) ids.add(id)
  }
  return ids
}
