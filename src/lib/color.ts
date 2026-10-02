// Deriva la paleta de acento (hover/soft/texto) a partir de un solo hex.
//
// `--accent`/`--accent-hover`/`--accent-soft`/`--accent-text-on-bg` viven
// como 4 constantes independientes en index.css — si Preferencias solo
// pisara `--accent`, los estados de hover/fondo suave quedarían con el
// teal original mientras el color base cambia, una re-tematización a
// medias. Esta función deriva las 4 variantes con la misma proporción que
// tienen hoy los valores por defecto (`--accent-hover` ≈ 12% más oscuro,
// `--accent-soft` ≈ mezcla 85% blanco, `--accent-foreground` = blanco o
// negro según contraste).

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Mezcla hacia negro (amount > 0, para el hover) o blanco (amount < 0
// pasado como target ya resuelto) — se usa con dos wrappers abajo en vez
// de exponer el signo, más legible en el call site.
function mixWith(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const [tr, tg, tb] = target
  return rgbToHex([r + (tr - r) * amount, g + (tg - g) * amount, b + (tb - b) * amount])
}

function darken(hex: string, amount: number): string {
  return mixWith(hex, [0, 0, 0], amount)
}

function lighten(hex: string, amount: number): string {
  return mixWith(hex, [255, 255, 255], amount)
}

// Se arma como `rgb(r g b / a)` y no con `color-mix()` en CSS a propósito:
// el minificador parte un `color-mix` en un valor plano + un bloque
// `@supports`, y el valor plano que elige para el fallback es el acento
// OPACO — o sea, justo lo que no se quiere de fondo. Calculándolo acá el
// resultado es un color literal, sin fallback que salga mal.
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

/** Grafito del sidebar (`--surface` del scope oscuro) y el fondo de página
 * oscuro, sobre los que se mezcla el acento en cada modo. */
const RAIL_GRAPHITE = '#151515'
const RAIL_DEEP = '#0C0C0C'

export type RailStyle = 'grafito' | 'tinte' | 'solido'

export interface RailPalette {
  /** Fondo del riel. El PANEL nunca se tiñe: el contraste entre los dos es
   * lo que arma la jerarquía (contrato visual del artifact). */
  bg: string
  border: string
  /** Fondo del módulo activo. Sobre un riel ya teñido el acento al 16% se
   * pierde contra su propio fondo, así que ahí se marca con blanco al 14%. */
  activeBg: string
  /** Color del ícono activo. El artifact solo define el fondo, pero con el
   * riel sólido —que YA es el acento— un ícono del mismo acento encima
   * desaparece; ahí va el mismo #FAFAFA que el resto del texto del riel,
   * que es justamente el contraste que el criterio de aceptación pide
   * verificar sobre los seis fondos sólidos. */
  activeFg: string
}

/**
 * Fondo del riel según la preferencia de cuenta (`profiles.rail_style`,
 * 0090_profile_rail_style.sql). Mismas mezclas lineales que el resto del
 * archivo — nada de `color-mix()` en CSS, ver el comentario de `rgba`.
 */
export function deriveRailPalette(hex: string, style: RailStyle): RailPalette {
  // `var(--accent)` y no el hex crudo: dentro del riel esa variable ya
  // resuelve al acento de la cuenta si hay uno y al turquesa oscuro del
  // scope si no (index.css). Congelar acá el hex de `accent_color` pintaría
  // el ícono con el tono pensado para fondo CLARO sobre el grafito.
  const accentFg = 'var(--accent)'

  // Sin borde en cuanto hay color. El borde existe para despegar un panel
  // grafito de un fondo casi del mismo gris; un riel teñido ya se separa
  // solo, y ahí la línea más clara del canto lo único que hace es
  // delinearlo como si fuera un recorte pegado encima. `transparent` y no
  // quitar el borde: se mantiene el 1px de la caja, así que el ancho de
  // 60px y la alineación con el panel no se mueven.
  if (style === 'tinte') {
    const bg = mixWith(RAIL_GRAPHITE, hexToRgb(hex), 0.12)
    return { bg, border: 'transparent', activeBg: rgba(hex, 0.16), activeFg: accentFg }
  }
  if (style === 'solido') {
    const bg = mixWith(RAIL_DEEP, hexToRgb(hex), 0.3)
    return { bg, border: 'transparent', activeBg: 'rgb(255 255 255 / 0.14)', activeFg: '#FAFAFA' }
  }
  // Grafito: exactamente los valores que el scope oscuro ya usa, escritos
  // igual para que prender y apagar la preferencia no mueva ni un píxel.
  return { bg: RAIL_GRAPHITE, border: '#2F2F2F', activeBg: rgba(hex, 0.16), activeFg: accentFg }
}

// Fórmula de luminancia relativa (WCAG) simplificada — alcanza para elegir
// negro/blanco como texto legible, no hace falta la versión con gamma exacta.
function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

export interface AccentPalette {
  accent: string
  accentHover: string
  /** Fondo suave del acento sobre una superficie CLARA — mezcla con blanco. */
  accentSoft: string
  /** El mismo rol sobre una superficie OSCURA. Mezclar con blanco ahí da un
   * bloque casi blanco (se vería en el riel del Sidebar, que pinta el
   * módulo activo con `bg-accent-soft`), así que es el acento a 18% de
   * opacidad — la misma proporción que el valor fijo que tenía el modo
   * oscuro antes de que el acento fuera configurable. */
  accentSoftOnDark: string
  /** Texto de acento sobre una superficie CLARA — el acento oscurecido. */
  accentTextOnBg: string
  /** El mismo rol pero sobre una superficie OSCURA: el acento aclarado.
   * Hace falta como valor aparte porque `accentTextOnBg` oscurece, y sobre
   * grafito eso queda ilegible — pasaba en tema oscuro con cualquier
   * acento elegido, y en los subárboles `.dark-scope` (Sidebar, tab bar
   * móvil) aun con la app en tema claro. */
  accentTextOnDark: string
  accentForeground: string
  /** Relleno sólido con texto encima (botones, avatares) y su hover. */
  accentSolid: string
  accentSolidHover: string
}

// Hover de marca: el magenta por defecto trae un par definido por diseño
// (#FF0055 → #D6004C) que no es exactamente lo que daría `darken(0.12)`
// (#E0004B). Cualquier otro color sigue la fórmula.
const BRAND_HOVER: Record<string, string> = { '#FF0055': '#D6004C' }
// Relleno sólido con texto: el magenta de marca no da 4.5:1 con blanco (3.9:1),
// así que ese color usa #D6004C (5.3:1) y su hover #B3003F. Cualquier otro
// color se usa tal cual.
const BRAND_SOLID: Record<string, [string, string]> = { '#FF0055': ['#D6004C', '#B3003F'] }

export function deriveAccentPalette(hex: string): AccentPalette {
  return {
    accent: hex,
    accentHover: BRAND_HOVER[hex.toUpperCase()] ?? darken(hex, 0.12),
    accentSolid: (BRAND_SOLID[hex.toUpperCase()] ?? [hex, darken(hex, 0.12)])[0],
    accentSolidHover: (BRAND_SOLID[hex.toUpperCase()] ?? [hex, darken(hex, 0.12)])[1],
    accentSoft: lighten(hex, 0.85),
    accentSoftOnDark: rgba(hex, 0.18),
    accentTextOnBg: darken(hex, 0.35),
    // 0.45 reproduce la proporción de los defaults: #40E0D0 aclarado así da
    // ≈#96EEE5, casi el #A8F2EC que el diseño usa en modo oscuro.
    accentTextOnDark: lighten(hex, 0.45),
    accentForeground: isLight(hex) ? '#0A0A0A' : '#FFFFFF',
  }
}
