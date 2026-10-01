/**
 * "Presiona C para crear una" en los estados vacíos — un atajo de teclado
 * que en un teléfono no existe. Reportado con captura: el tablero vacío
 * invitaba a apretar una tecla en una pantalla sin teclado, mientras el
 * botón que sí sirve (el flotante de MobileQuickCreate.tsx) estaba ahí
 * abajo sin que nada lo mencionara.
 *
 * `@media (hover: none)` en vez de un breakpoint de ancho: la pregunta no
 * es cuánto mide la pantalla sino si hay puntero fino — un iPad en
 * horizontal es ancho y sigue sin tecla "C" a mano, y una ventana angosta
 * de escritorio sí la tiene. Mismo criterio que FieldVisibilityToggles.tsx.
 */
export function CreateHint() {
  return (
    <>
      <span className="[@media(hover:none)]:hidden">Presiona C para crear una.</span>
      <span className="hidden [@media(hover:none)]:inline">Toca + para crear una.</span>
    </>
  )
}
