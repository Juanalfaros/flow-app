import { toast } from 'sonner'

// F-06: patrón "deshacer" para acciones que hoy no tienen ningún margen de
// arrepentimiento — una acción masiva (reasignar/fecha/estado sobre la
// selección) se aplicaba al toque, sin vuelta atrás salvo deshacer cada
// tarea a mano una por una. `confirmWithUndo` muestra el toast con un
// botón "Deshacer" y solo dispara `onConfirm` pasado `delayMs` sin que se
// haya cancelado — mismo patrón que "Deshacer envío" de Gmail (el envío
// real también se demora, no se manda y se revierte).
export function confirmWithUndo(message: string, onConfirm: () => void, delayMs = 5000) {
  const state = { cancelled: false }
  const timeoutId = setTimeout(() => {
    if (!state.cancelled) onConfirm()
  }, delayMs)

  toast(message, {
    duration: delayMs,
    action: {
      label: 'Deshacer',
      onClick: () => {
        state.cancelled = true
        clearTimeout(timeoutId)
      },
    },
  })

  return state
}
