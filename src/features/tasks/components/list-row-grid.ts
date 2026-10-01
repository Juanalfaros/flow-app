// Columnas compartidas entre TaskRow.tsx, SubtaskInlineRow.tsx y
// ListHeaderRow (list.tsx) — deben ser el mismo string en los tres para
// que los rótulos del encabezado (repetido por sección, F-13) queden
// alineados con su dato, fila por fila.
//
// Reportado por el usuario dos veces sobre la primera versión de este
// archivo: (1) el título como `1fr` dejaba un hueco enorme antes de la
// metadata; (2) corregido eso con un techo + una columna final vacía,
// pero esa columna vacía a su vez dejaba sin usar buena parte del ancho
// en un monitor grande — "un colchón vacío" a la derecha, solo movido
// de lugar. La solución real: las columnas de metadata (Asignado/Fecha/
// Estado) son `minmax(N, 1fr)`, no `minmax(N, auto)` — comparten el
// espacio libre de verdad entre sí (mismo criterio que la captura de
// ClickUp: las columnas se reparten el ancho, no quedan agrupadas). A
// diferencia de `auto` (que depende del contenido de CADA fila,
// pudiendo desalinearse entre filas con contenido de distinto largo),
// `1fr` reparte espacio según el contenedor, no el contenido — todas
// las filas (misma plantilla, mismo ancho de contenedor) terminan con
// las mismas columnas en píxeles, alineadas de verdad.
// 20px, no 18px: en angosto el checkbox de la fila crece a `size-5` para
// ser señalable con el dedo (ver TaskRow.tsx) y a 18px quedaba recortado.
// La plantilla ancha sigue en 18px — ahí el checkbox vuelve a `size-4`.
export const LIST_ROW_GRID_NARROW = 'grid-cols-[20px_1fr_auto]'
export const LIST_ROW_GRID_WIDE =
  '@min-[640px]:grid-cols-[18px_minmax(0,26rem)_minmax(90px,1fr)_minmax(90px,1fr)_36px_minmax(110px,1fr)]'

// Campos personalizados agregados a mano como columna extra ("+ Añadir"
// del encabezado, pedido explícito del usuario) — un número variable de
// columnas no se puede expresar como una clase de Tailwind estática (el
// scanner necesita el string completo en el código fuente, no armado en
// tiempo de ejecución), así que ese caso arma el grid entero en JS y se
// aplica por `style`, no por clase. Se abandona a propósito el
// responsive angosto/ancho en ese caso: si alguien suma columnas extra,
// ya está pidiendo más densidad, no menos — la fila puede necesitar
// scroll horizontal en una pantalla angosta (el contenedor de la lista
// tiene `overflow-x-auto` para eso), en vez de intentar wrappear 8+
// columnas en 390px.
export function extraColumnsGridTemplate(extraCount: number): string {
  const base = '18px minmax(0,26rem) minmax(90px,1fr) minmax(90px,1fr) 36px minmax(110px,1fr)'
  if (extraCount === 0) return base
  const extras = Array.from({ length: extraCount }, () => 'minmax(90px,1fr)').join(' ')
  return `${base} ${extras}`
}
