import type { FormEvent, ReactNode } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DialogPortal, DialogOverlay } from "@/components/ui/dialog"

// Variante de `Dialog` para formularios de creación en móvil (Nueva tarea,
// Nuevo espacio/carpeta/lista): el `DialogContent` normal se centra con
// `position: fixed; top: 50%`, calculado contra el LAYOUT viewport — que en
// iOS Safari no se achica cuando aparece el teclado (solo `visualViewport`
// sí). El resultado real, reportado con el mismo síntoma en el Sheet de
// crear tarea: el diálogo queda centrado contra una mitad de pantalla que
// ya no existe, y el botón de confirmar termina tapado por el teclado justo
// cuando se termina de escribir.
//
// La solución no es perseguir el teclado con JS (frágil, depende de
// `visualViewport` comportándose igual en cada versión de iOS): es no
// necesitar centrado. En mobile el diálogo pasa a ocupar TODA la pantalla,
// con Cancelar/título/confirmar en una cabecera fija arriba — un lugar que
// el teclado, por definición, nunca tapa. En escritorio (`md:` en
// adelante) se ve exactamente como el `DialogContent` de siempre: no hay
// teclado táctil que perseguir ahí.
export interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se omite cuando el diálogo se controla 100% por `open`/`onOpenChange`
   * desde afuera (mismo patrón que `trigger="none"` en NewProjectDialog). */
  trigger?: ReactNode
  title: string
  /** Nodo, no string: así el caller decide el texto en vuelo ("Creando…")
   * sin que este componente tenga que conocer el estado de la mutación. */
  submitLabel: ReactNode
  submitDisabled?: boolean
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}

export function FormDialog({
  open,
  onOpenChange,
  trigger,
  title,
  submitLabel,
  submitDisabled,
  onSubmit,
  children,
}: FormDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            // Mobile: pantalla completa, sin traducir/centrar nada — el
            // problema de fondo (centrado contra un viewport que el
            // teclado no reduce) deja de existir si no hay que centrar.
            "fixed inset-0 z-50 flex flex-col bg-bg text-sm text-text outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            // Desktop: la tarjeta centrada de siempre — mismas clases que
            // `DialogContent` (dialog.tsx), repetidas acá con el prefijo
            // `md:` porque a esta altura ya no comparte esa clase base.
            "md:top-1/2 md:left-1/2 md:h-auto md:max-h-[85dvh] md:w-full md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:gap-4 md:overflow-y-auto md:rounded-xl md:bg-popover md:p-4 md:text-popover-foreground md:ring-1 md:ring-foreground/10 md:data-open:zoom-in-95 md:data-closed:zoom-out-95",
          )}
        >
          {/* `md:contents`: en escritorio el <form> se aplana y sus 3 hijos
              (cabecera, cuerpo, pie) pasan a ser ítems directos del `grid
              gap-4` de arriba — mismo patrón ya probado en
              ProjectPageHeader.tsx. Así el espaciado vertical desktop
              coincide con el que tenía DialogContent antes de que existiera
              esta variante, sin duplicar esas clases acá. */}
          <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col md:contents">
            {/* Cabecera: UNA sola vez en el DOM (Cancelar/título/confirmar
                en mobile, solo título en escritorio) — no dos instancias de
                <DialogPrimitive.Title>, que comparten un único id interno
                en Radix y duplicarlo rompe el aria-labelledby del diálogo. */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:flex-col md:items-start md:border-b-0 md:p-0 md:pt-0">
              <DialogPrimitive.Close asChild className="md:hidden">
                <Button type="button" variant="ghost" size="sm">
                  Cancelar
                </Button>
              </DialogPrimitive.Close>
              <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-center text-sm font-semibold md:flex-none md:text-left md:font-heading md:text-base md:leading-none md:font-medium">
                {title}
              </DialogPrimitive.Title>
              <Button type="submit" size="sm" disabled={submitDisabled} className="md:hidden">
                {submitLabel}
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:mt-4 md:flex-none md:overflow-visible md:p-0">
              <div className="flex flex-col gap-3">{children}</div>
            </div>

            {/* Pie de escritorio: mismo lugar donde ya vivía el botón en
                los 3 diálogos que esto reemplaza (DialogFooter). */}
            <div className="hidden md:-mx-4 md:-mb-4 md:flex md:flex-col-reverse md:gap-2 md:rounded-b-xl md:border-t md:bg-muted/50 md:p-4 md:sm:flex-row md:sm:justify-end">
              <Button type="submit" disabled={submitDisabled}>
                {submitLabel}
              </Button>
            </div>
          </form>

          {/* X de escritorio — en mobile "Cancelar" ya cumple ese rol. */}
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hidden md:absolute md:top-2 md:right-2 md:inline-flex"
            >
              <XIcon />
              <span className="sr-only">Cerrar</span>
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}
