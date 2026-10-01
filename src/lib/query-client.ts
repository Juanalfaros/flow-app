import { QueryClient } from '@tanstack/react-query'
import { initOfflineQueue } from '@/lib/offline-queue'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Realtime aplica patches sobre el cache; el refetch solo debe
      // ocurrir al montar y al reconectar, nunca en cada cambio.
      staleTime: Infinity,
    },
  },
})

initOfflineQueue(queryClient)
