import { useNavigate, useSearch } from '@tanstack/react-router'

/**
 * El panel de persona vive en un search param, no en estado local.
 *
 * Mismo mecanismo que `?node=` para el detalle de tarea (ver lib/node-param.ts)
 * y por los mismos motivos: el panel queda enlazable ("mira la ficha de X"),
 * sobrevive a un refresh, y el botón atrás del navegador lo cierra en vez de
 * sacarte de la sección.
 */
export function usePersonSearchParam(): string | null {
  const search = useSearch({ strict: false }) as { persona?: string }
  return search.persona ?? null
}

export function useSetPersonSearchParam() {
  const navigate = useNavigate()
  return (userId: string | null) => {
    // `to: '.'` mantiene la ruta hija actual (personas/equipos/organigrama):
    // sin él, navegar desde el layout resolvería contra `/equipo` y perdería
    // en qué pestaña estabas al abrir o cerrar el panel.
    //
    // `equipo: undefined` de paso (PR4 del rediseño de Equipo): los paneles
    // de persona y de equipo comparten la misma columna derecha — abrir
    // una ficha de persona cierra cualquier ficha de equipo que hubiera
    // quedado abierta, mismo motivo que team-param.ts hace lo simétrico.
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...prev, persona: userId ?? undefined, equipo: undefined }),
      replace: true,
    })
  }
}
