import { useSyncExternalStore } from 'react'

// Estado compartido para poder abrir el diálogo de atajos (KeyboardShortcutsDialog)
// desde más de un lugar — antes solo vivía como un `useState` local de
// AppShell.tsx, abierto únicamente desde el botón "Ayuda y atajos" del
// sidebar. El rediseño de Ajustes PR 4 suma un segundo disparador ("Ver
// atajos" en Preferencias) que necesita el mismo estado, no una instancia
// propia del diálogo — AppShell ya lo renderiza una sola vez para toda la
// app autenticada (envuelve /profile igual que cualquier otra ruta), así
// que apuntar los dos disparadores a esta única fuente alcanza; no hace
// falta montar un segundo `<KeyboardShortcutsDialog>`.
//
// En memoria, no en localStorage: es un modal transitorio, no una
// preferencia — recargar la página no debería reabrirlo.
let open = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

export function setShortcutsDialogOpen(next: boolean) {
  open = next
  notify()
}

export function useShortcutsDialogOpen(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    () => open,
    () => false,
  )
}
