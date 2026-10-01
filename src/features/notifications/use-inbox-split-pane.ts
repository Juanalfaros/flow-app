import { useSyncExternalStore } from 'react'

// Debajo de esto, Bandeja se queda con el comportamiento de siempre (la
// fila navega al detalle completo de la tarea, `/p/:id/t/:id`). Por
// encima, la fila abre esa misma tarea EN EL LUGAR, en un panel al lado
// de la lista — auditoría de layout, Decisión 3 ("revisar 20
// notificaciones pasa a ser bajar por la lista, no abrir y cerrar 20
// paneles").
//
// El umbral real que importa es el ANCHO DE CONTENIDO disponible (1100px,
// que es lo que pide la maqueta), no el de la ventana — pero a diferencia
// del resto de esta pantalla (que sí usa `@min-[...]:` de contenedor para
// pura ESTÉTICA), acá el ancho decide un comportamiento de navegación
// (qué hace un clic), y CSS no puede decidir eso: hace falta JS. Mismo
// trade-off que ya se aceptó en task-view-mode.ts (`isMobile`, con
// `matchMedia` sobre la VENTANA, no sobre el contenedor real) — es una
// aproximación, no un cálculo exacto.
//
// 1440px de ventana en vez de 1100px de contenido: el riel+panel del
// sidebar ocupan 318px expandido (o 84px colapsado) — 1440-318=1122,
// arriba del piso real incluso con el sidebar expandido. Una laptop de
// 1280-1366px (la más común) queda afuera a propósito: 1280-318=962,
// insuficiente para dos columnas legibles.
const WIDE_QUERY = '(min-width: 1440px)'

function getSnapshot(): boolean {
  return window.matchMedia(WIDE_QUERY).matches
}

function subscribe(callback: () => void) {
  const mql = window.matchMedia(WIDE_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

export function useInboxSplitPane(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
