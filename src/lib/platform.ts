// A-06: los hints de atajos ("⌘K") estaban escritos a mano asumiendo Mac —
// en Windows/Linux el atajo real es Ctrl+K (así lo escucha
// CommandPalette.tsx: `e.metaKey || e.ctrlKey`), así que el hint mentía en
// la mayoría de las máquinas. `navigator.platform` está deprecado pero
// sigue siendo el chequeo más simple y ampliamente soportado para esto;
// no hay reactividad real que ganar (la plataforma no cambia en caliente),
// así que es una constante de módulo, no un hook.
const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? navigator.userAgent ?? '')

export const MOD_KEY = isMac ? '⌘' : 'Ctrl'
export const MOD_KEY_HINT = isMac ? '⌘K' : 'Ctrl+K'
