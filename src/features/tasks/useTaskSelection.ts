import { useCallback, useState } from 'react'

export function isTypingTarget(el: EventTarget | null): boolean {
  const target = el as HTMLElement | null
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true
}

function focusTaskElement(taskId: string) {
  document.getElementById(`task-${taskId}`)?.focus()
}

// `activeId` es el foco de teclado (dónde está el cursor J/K), `selectedIds`
// es qué recibe la acción masiva (A/D/1-5) — antes eran el mismo concepto
// (`selectedIds` incluía siempre `activeId`), y `activeId` arrancaba en
// `orderedIds[0]`. Resultado: con la caché de TanStack Query tibia (volver
// al Board desde otra vista), la vista montaba con una tarea ya
// "seleccionada" sin que nadie hubiera tocado nada — barra flotante +
// anillo de acento en la primera tarjeta desde el primer render (B-03).
// Ahora el foco arranca en `null` y moverlo (J/K sin Shift) no selecciona
// nada por sí solo — sólo Shift+J/K (extend) y X (toggleActive) tocan la
// selección real, igual que en cualquier gestor de archivos.
export function useTaskSelection(orderedIds: string[]) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const move = useCallback(
    (delta: 1 | -1) => {
      if (orderedIds.length === 0) return
      const currentIndex = activeId ? orderedIds.indexOf(activeId) : -1
      const nextIndex = Math.min(Math.max(currentIndex + delta, 0), orderedIds.length - 1)
      // El clamp ya garantiza un índice dentro del rango, pero el tipo no lo
      // sabe: se comprueba el valor en vez de afirmarlo con `!`, que además
      // rompería en silencio si alguien cambiara el clamp más adelante.
      const nextId = orderedIds[nextIndex]
      if (!nextId) return
      setActiveId(nextId)
      // Mover sin Shift limpia cualquier selección previa — mismo criterio
      // que antes de este cambio, sólo que ahora "mover" ya no implica
      // "seleccionar la tarea a la que se llega".
      setSelectedIds(new Set())
      focusTaskElement(nextId)
    },
    [activeId, orderedIds],
  )

  const extend = useCallback(
    (delta: 1 | -1) => {
      if (orderedIds.length === 0) return
      const currentIndex = activeId ? orderedIds.indexOf(activeId) : -1
      const nextIndex = Math.min(Math.max(currentIndex + delta, 0), orderedIds.length - 1)
      const nextId = orderedIds[nextIndex]
      if (!nextId) return
      // Selecciona tanto el punto de partida (activeId, que ya no viene
      // incluido gratis en selectedIds) como el nuevo destino — así el
      // rango crece de a uno por pulsación, igual que antes.
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (activeId) next.add(activeId)
        next.add(nextId)
        return next
      })
      setActiveId(nextId)
      focusTaskElement(nextId)
    },
    [activeId, orderedIds],
  )

  const toggleActive = useCallback(() => {
    if (!activeId) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(activeId)) next.delete(activeId)
      else next.add(activeId)
      return next
    })
  }, [activeId])

  // Limpiar selección (Escape, botón "Limpiar" de SelectionActionBar) — no
  // toca el foco de teclado, sólo qué está marcado para la acción masiva.
  const clear = useCallback(() => setSelectedIds(new Set()), [])

  return { activeId, selectedIds, move, extend, toggleActive, clear }
}
