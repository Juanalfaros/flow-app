import { useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isTypingTarget } from '@/features/tasks/useTaskSelection'
import { TASK_VIEW_SHORTCUTS } from '@/features/nodes/useNodeViewController'
import { ALL_MODULES } from '@/components/layout/sidebar/modules'

// S-04: "Ayuda y atajos" era un mock "Pronto" en el sidebar aunque casi
// todos los atajos ya funcionaban de verdad (Cmd/Ctrl+K y / abren la
// paleta de comandos, J/K/X/1-5/A/D operan la selección en Board/Lista) —
// simplemente no había ningún lugar en la UI que los listara. Esta es esa
// lista: los globales de acá al lado, más TASK_VIEW_SHORTCUTS
// (useNodeViewController.ts, la misma fuente que implementa esos atajos).
const GLOBAL_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Ctrl/⌘ + K', label: 'Abrir buscar o crear' },
  { keys: '/', label: 'Abrir buscar o crear (alternativo)' },
  { keys: '?', label: 'Ver esta ayuda' },
]

// Derivados de la misma lista que dibuja el riel y que implementa los
// atajos (modules.ts + use-module-shortcuts.ts): un módulo nuevo aparece
// acá solo, sin que nadie se acuerde de venir a agregarlo.
const MODULE_SHORTCUTS = ALL_MODULES.map((m) => ({
  keys: `G luego ${m.key.toUpperCase()}`,
  label: m.label,
}))

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Sin Shift, "?" en un teclado en español llega como Shift+"/" en
      // muchos layouts — igual que el propio "/" de la paleta de comandos
      // (CommandPalette.tsx), se ignora dentro de inputs/editables.
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ayuda y atajos</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          <ShortcutGroup title="General" shortcuts={GLOBAL_SHORTCUTS} />
          <ShortcutGroup title="Ir a" shortcuts={MODULE_SHORTCUTS} />
          <ShortcutGroup title="Board y Lista (con una tarea enfocada)" shortcuts={TASK_VIEW_SHORTCUTS} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ShortcutGroup({ title, shortcuts }: { title: string; shortcuts: { keys: string; label: string }[] }) {
  return (
    <div>
      <h3 className="mb-1.5 font-mono text-[11px] font-semibold tracking-wide text-text-muted uppercase">{title}</h3>
      <ul className="flex flex-col gap-1">
        {shortcuts.map((s) => (
          <li key={s.keys} className="flex items-center justify-between gap-3 py-0.5">
            <span className="text-text-secondary">{s.label}</span>
            <kbd className="shrink-0 rounded-md border border-border bg-surface-alt px-1.5 py-0.5 font-mono text-xs text-text-muted">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </div>
  )
}
