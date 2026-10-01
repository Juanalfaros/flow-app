import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

export interface CreateMenuOption {
  key: string
  icon: IconSvgElement
  label: string
  description: string
  onSelect: () => void
}

/**
 * Hoja de "qué querés crear acá", en mobile. Sin campo de texto — cada
 * opción solo elige QUÉ crear y abre su propio `FormDialog` (que sí
 * pregunta el nombre) — así esta hoja nunca convive con un teclado abierto,
 * y no hereda el problema que motivó form-dialog.tsx.
 *
 * Mismo contenido que el `DropdownMenu` de 3 opciones que ya tiene el
 * sidebar de escritorio (EspaciosPanel.tsx/NodeTreeItem.tsx: Espacio ·
 * Carpeta · Lista, o Carpeta · Lista dentro de un nodo) — acá como una
 * hoja porque es lo que ya usa el resto de la navegación mobile
 * (MobileMoreSheet.tsx), no un menú flotante pensado para mouse.
 */
export function MobileCreateMenu({
  open,
  onOpenChange,
  title,
  options,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  options: CreateMenuOption[]
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="flex flex-col border-border bg-surface p-0 text-text data-[side=bottom]:max-h-[85vh]"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div className="shrink-0 pt-2 pb-1">
          <span className="mx-auto block h-1 w-9 rounded-full bg-border-strong" aria-hidden="true" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <p className="mt-2 mb-1 px-1 text-sm font-semibold">{title}</p>
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                onOpenChange(false)
                opt.onSelect()
              }}
              className="flex min-h-16 w-full items-center gap-3 border-b border-border px-1 text-left transition-colors last:border-b-0 active:bg-surface-alt"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text-on-bg">
                <HugeiconsIcon icon={opt.icon} className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{opt.label}</span>
                <span className="block truncate text-xs text-text-muted">{opt.description}</span>
              </span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
