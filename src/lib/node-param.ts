import { getRouteApi, useRouter } from '@tanstack/react-router'

// `?node=<id>` vive en el search de `/_app` (ver route.tsx) — cualquier
// componente por debajo puede leerlo/escribirlo sin conocer el search
// completo de su propia ruta (que puede tener TaskFilters u otros campos
// propios, ej. board.tsx/list.tsx). `getRouteApi` es el patrón correcto
// para LEER el search de una ruta específica desde un componente que no
// es el de esa ruta.
const appRouteApi = getRouteApi('/_app')

export function useNodeSearchParam(): string | null {
  const { node } = appRouteApi.useSearch()
  return node ?? null
}

export function useSetNodeSearchParam() {
  // Para ESCRIBIR, `appRouteApi.useNavigate()` no sirve: sin `to`
  // explícito resuelve relativo a `/_app` (no a la ruta hija realmente
  // activa — board/list/detalle), así que abrir una tarea desde /list
  // terminaba navegando a `/_app` y disparando su propio beforeLoad
  // (redirect al primer proyecto), perdiendo la ruta actual — bug real
  // encontrado probando esto en navegador. Fix: usar el router crudo y
  // fijar `to` al pathname actual explícitamente, sin ambigüedad.
  const router = useRouter()
  return (nodeId: string | null) =>
    router.navigate({
      to: router.state.location.pathname,
      search: (prev) => ({ ...prev, node: nodeId ?? undefined }),
    })
}
