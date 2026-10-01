import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ALL_MODULES } from '@/components/layout/sidebar/modules'
import { isTypingTarget } from '@/features/tasks/useTaskSelection'
import { setSelectedModule, setSidebarPanelOpen } from '@/lib/sidebar-state'

/** Cuánto espera la `g` a su segunda tecla. Un acorde de teclado que no
 * caduca deja la app en un modo invisible: apretás `g`, te distraés, y diez
 * minutos después una `b` cualquiera te teletransporta a Bandeja. */
const CHORD_MS = 1200

/**
 * Atajos `g` + inicial para saltar entre módulos, montados una sola vez
 * desde AppShell.tsx. Las teclas viven en `modules.ts` junto al ícono y la
 * ruta, así que agregar un módulo trae su atajo sin tocar este archivo.
 *
 * Solo escritorio: no se guarda contra el ancho porque en un teléfono no
 * hay teclado físico que los dispare, y el costo de dejarlos montados es un
 * listener que nunca coincide.
 */
export function useModuleShortcuts() {
  const navigate = useNavigate()
  // Ref y no estado: esto no pinta nada, y un `setState` por cada `g`
  // re-renderizaría el shell entero para nada.
  const armedAt = useRef(0)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Un acorde no lleva modificadores: sin esto, Ctrl+G (buscar
      // siguiente del navegador) o ⌘I dejarían el acorde armado o robarían
      // la tecla.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return

      if (e.key === 'g') {
        armedAt.current = Date.now()
        return
      }

      if (armedAt.current === 0 || Date.now() - armedAt.current > CHORD_MS) {
        armedAt.current = 0
        return
      }
      armedAt.current = 0

      const mod = ALL_MODULES.find((m) => m.key === e.key.toLowerCase())
      if (!mod) return

      e.preventDefault()
      // `stopPropagation` además de `preventDefault`: Board y Lista tienen
      // sus propios atajos de una sola tecla (J/K/X/1-5/A/D, ver
      // useNodeViewController.ts) y dos de ellos chocan con la segunda mitad
      // del acorde — sin esto, `g` + `a` iba a Ajustes Y asignaba la tarea
      // enfocada. `preventDefault` solo no alcanza: no frena a los otros
      // listeners, solo la acción por defecto del navegador.
      e.stopPropagation()
      setSelectedModule(mod.id)
      if (mod.route) {
        navigate({ to: mod.route })
      } else {
        // Espacios no tiene página propia: su atajo solo cambia el panel, y
        // con el panel colapsado eso no se vería — ahí sí lo abre, porque
        // "ir a Espacios" sin nada visible no es ir a ningún lado. Los
        // módulos con ruta no lo tocan: ya se ve que algo pasó.
        setSidebarPanelOpen(true)
      }
    }

    // Fase de captura (`true`): baja desde window hasta el elemento, así
    // que corre ANTES que cualquier listener de burbujeo sin importar en
    // qué orden se montaron los componentes — que es lo que hace que el
    // `stopPropagation` de arriba sea confiable y no dependa de quién se
    // registró primero.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [navigate])
}
