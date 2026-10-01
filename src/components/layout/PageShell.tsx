import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

// Contenedor de página compartido — reemplaza los `mx-auto max-w-*` que
// cada página de "chrome" (Inicio, Bandeja, Mis tareas, Reportes, Perfil,
// Plantillas, Campos personalizados, Archivados, Espacios) elegía por su
// cuenta. Antes había 4 anchos distintos (2xl/3xl/4xl/6xl) sin ningún
// comentario que explicara por qué CADA página eligió el suyo — a
// diferencia del `max-w-[1400px]` de list.tsx, que sí se fijó con
// evidencia (reportado con captura: sin techo, las filas se estiraban sin
// que ninguna columna de metadata llenara ese espacio). Auditoría de
// layout, 2026-09-23.
//
// Tres anchos, y ninguno más — si algo no entra en los tres, el problema
// es el contenido, no que falte un cuarto token "para este caso":
//   prose — 760px. Texto corrido y formularios de una columna. Pasar de
//           ~90 caracteres por línea empeora la lectura, no la mejora.
//   app   — 1400px, EL MISMO número que list.tsx/NodeDetailContent (modo
//           página completa) ya tienen desde antes — reusarlo es
//           convertir esa medida en decisión de sistema, no en excepción
//           de una sola pantalla. Para listas, tablas y dashboards.
//   full  — sin techo. Los lienzos (Board/Gantt/Calendario/Tabla) ya
//           viven así y están bien; ninguna página de "chrome" lo usa
//           todavía, pero el token existe para no inventar un cuarto
//           caso el día que haga falta.
const WIDTH_CLASS: Record<PageShellWidth, string> = {
  prose: 'max-w-[760px]',
  app: 'max-w-[1400px]',
  full: '',
}

export type PageShellWidth = 'prose' | 'app' | 'full'

interface PageShellProps extends ComponentPropsWithoutRef<'div'> {
  width: PageShellWidth
}

// `...rest` (no solo `children`/`className`): así una página puede pasar
// `role="status"`/`aria-label` directo al contenedor real en vez de tener
// que envolver un `<div>` extra adentro solo para eso — ver los
// esqueletos en PageSkeletons.tsx.
//
// Sin `surface` (PR #126, revertido en el plan de corrección del
// 2026-09-24): esa variante le daba a CADA página su propia caja
// (rounded-panel/border/shadow), pero casi todas esas páginas ya tenían
// sus secciones como tarjetas propias (SectionCard, la columna de
// Plantillas, la fila de Campos personalizados...) — el resultado real,
// confirmado con capturas de producción, era caja dentro de caja dentro
// de caja, hasta 3 niveles en Inicio/Plantillas/Campos/Bandeja. La
// superficie compartida vuelve, pero en <main> (AppShell.tsx), con el
// interior de cada página aplanado — no acá.
export function PageShell({ width, children, className, ...rest }: PageShellProps) {
  return (
    <div
      className={cn(
        // `px-5` (20px), no `px-4` (16px): reportado por el usuario en
        // mobile real (varios dispositivos/navegadores) — el contenido se
        // veía "pegado" al borde izquierdo. El padding SÍ se aplicaba
        // (confirmado con el panel Computed de DevTools: `padding-left:
        // 16px` exacto), pero 16px se sentía corto al lado del saludo en
        // negrita grande de Inicio. 20px no es un número inventado acá:
        // es el mismo `padding-inline: 20px` que ya trae `.page` en el
        // mockup de Inicio (F353ztRYbFpxDKGub3ZMKy) — PageShell nunca lo
        // había igualado.
        'mx-auto flex w-full flex-col gap-4 px-5 py-6',
        // `@min-[640px]:`, no `sm:`/`md:`: el ancestro real de esta pieza
        // es `<main>` en AppShell.tsx, que ya es `@container` a propósito
        // — colapsar el panel del sidebar le suma 234px de ancho a ese
        // contenedor sin que la VENTANA cambie de tamaño. Un breakpoint de
        // viewport (`md:`) nunca se entera de eso; uno de contenedor, sí.
        // 640: mismo número que ya usa NodeDetailContent.tsx para el
        // mismo salto de padding (`p-4 @min-[640px]:p-6`) — no es un
        // valor nuevo, es reusar el que ya existía.
        '@min-[640px]:px-6',
        WIDTH_CLASS[width],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
