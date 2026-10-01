import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'
import { clearOfflineQueue } from '@/lib/offline-queue'
import { sessionQueryOptions } from '@/features/auth/queries'

export function AuthListener() {
  const queryClient = useQueryClient()
  const router = useRouter()

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      queryClient.setQueryData(sessionQueryOptions().queryKey, session)
      if (event === 'SIGNED_OUT') {
        // purga el cache del usuario anterior antes de que otro se loguee.
        // `queryClient.clear()` solo vacía memoria — en disco quedaban dos
        // copias de los mismos datos que sobrevivían al logout:
        //   - Cache Storage 'supabase-data': el service worker (src/sw.ts)
        //     guarda hasta 200 respuestas de /rest/v1/ por 24h con la URL
        //     como única clave, así que en un equipo compartido el siguiente
        //     usuario leía tareas/comentarios/perfiles del anterior.
        //   - IndexedDB 'flow-offline': mutaciones encoladas que se
        //     harían flush bajo la sesión equivocada (ver clearOfflineQueue).
        queryClient.clear()
        void caches?.delete('supabase-data')
        void clearOfflineQueue()
      }
      // Bug real encontrado probando login en navegador: el token quedaba
      // en localStorage y el query cache de sesión se actualizaba, pero
      // la SPA se quedaba parada en /login — nada disparaba una
      // navegación tras el cambio de sesión. Los guards de `beforeLoad`
      // (en /login y en /_app) solo corren cuando el router intenta
      // matchear rutas, no reactivamente sobre el query cache.
      // `router.invalidate()` fuerza ese re-match: con sesión nueva,
      // /login redirige a '/'; sin sesión, /_app redirige a /login.
      void router.invalidate()
    })
    return () => subscription.subscription.unsubscribe()
  }, [queryClient, router])

  return null
}
