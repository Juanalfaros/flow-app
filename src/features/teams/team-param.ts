import { useNavigate, useSearch } from '@tanstack/react-router'

/**
 * El panel de equipo vive en un search param, mismo mecanismo y mismos
 * motivos que `?persona=` (ver people/person-param.ts) — rediseño de
 * Equipo, PR4 (2026-09-24): "Equipos" gana su propia ficha en la misma
 * columna derecha que ya usa Personas.
 */
export function useTeamSearchParam(): string | null {
  const search = useSearch({ strict: false }) as { equipo?: string }
  return search.equipo ?? null
}

export function useSetTeamSearchParam() {
  const navigate = useNavigate()
  return (teamId: string | null) => {
    void navigate({
      to: '.',
      // `persona: undefined` de paso: los dos paneles comparten la misma
      // columna, así que abrir un equipo cierra cualquier ficha de
      // persona que hubiera quedado abierta, y viceversa (ver
      // person-param.ts) — sin esto, la URL podía terminar con los dos
      // params a la vez y la columna no tenía cómo decidir cuál mostrar.
      search: (prev: Record<string, unknown>) => ({ ...prev, equipo: teamId ?? undefined, persona: undefined }),
      replace: true,
    })
  }
}
