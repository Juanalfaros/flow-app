import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa-install-dismissed'

export function InstallPrompt() {
  const deferredEvent = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      deferredEvent.current = event as BeforeInstallPromptEvent

      toast('Instala Flow para acceso rápido y uso sin conexión', {
        duration: 15000,
        action: {
          label: 'Instalar',
          onClick: async () => {
            const promptEvent = deferredEvent.current
            if (!promptEvent) return
            await promptEvent.prompt()
            await promptEvent.userChoice
            deferredEvent.current = null
          },
        },
        onDismiss: () => localStorage.setItem(DISMISSED_KEY, '1'),
      })
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  return null
}
