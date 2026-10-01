import { Switch as SwitchPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/lib/utils'

// Interruptor de verdad, no un checkbox: en Ajustes cada fila es "esto está
// prendido o apagado" (avisos, horario de silencio, resumen), no "marco esta
// opción de una lista". Hasta el rediseño de 2026-09-25 todos esos booleanos
// usaban Checkbox porque no existía este primitivo — el mockup los muestra
// como switches y ese es el gesto correcto para una preferencia que se aplica
// sola, sin botón de guardar.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border transition-colors outline-none',
        'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-55',
        // `data-[state=checked]:`, no `data-checked:`: Radix Switch marca el
        // estado con `data-state="checked"` (a diferencia de Checkbox, que en
        // esta versión sí usa `data-checked`). Con el selector equivocado el
        // interruptor encendido se veía igual que el apagado.
        //
        // `bg-accent` y no `bg-primary`: `--primary` acá es el gris casi
        // blanco que hereda shadcn, y un interruptor encendido en gris no se
        // distingue de uno apagado. El acento es además el color que cada
        // cuenta elige en Preferencias, así que el estado "sí, esto está
        // prendido" usa el mismo color que el resto de la app.
        'data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow-sm ring-0 transition-transform',
          'data-[state=checked]:translate-x-[18px]',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
