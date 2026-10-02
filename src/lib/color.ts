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
  /** Variante para modo oscuro (y para los subárboles `.dark-scope`). */
  dark: AccentDarkPalette
}

// ---------------------------------------------------------------------------
// Acentos de marca (2026-10-02). Cuatro colores con variantes propias en modo
// claro y oscuro; se identifican por su hex "principal claro", que es lo que
// se guarda en `profiles.accent_color`.
//
// Qué significa cada campo:
//   accent      color de marca para texto/íconos/líneas/rellenos SIN texto.
//   hover       su hover.
//   foreground  texto sobre un relleno sólido.
//   solid(+Hover) relleno sólido CON texto encima. Casi siempre es el propio
//               color; el magenta usa #D6004C porque blanco sobre #FF0055 da
//               3.9:1 y sobre #D6004C 5.3:1 (AA).
//   textOnBg    (solo claro) acento como TEXTO sobre fondo claro. Amarillo y
//               menta son demasiado claros para eso (1.7–1.9:1), así que
//               tienen una versión más oscura.
//   textAccent  (solo oscuro) el acento usado como texto sobre grafito. El
//               púrpura #811DBC da 2.5:1 sobre #151515; esta versión da 5.1:1.
// Todos los colores que se pueden elegir en Ajustes están acá, cada uno con su
// par claro/oscuro. Un hex fuera de la tabla (no se puede elegir desde la UI,
// pero podría venir de datos antiguos) sigue la fórmula genérica, igual en
// ambos modos.
interface PresetMode {
  accent: string
  hover: string
  foreground: string
  solid: string
  solidHover: string
  textOnBg?: string
  textAccent?: string
}
interface AccentPreset {
  light: PresetMode
  dark: PresetMode
}

const DARK_INK = '#080501'
// Retirados el 2026-10-02 (comentados abajo) por parecerse a los de marca:
// Turquesa≈Verde menta, Violeta≈Púrpura, Rosa≈Magenta, Ámbar≈Amarillo,
// Verde≈Verde menta. 0097_accent_palette_cleanup.sql migra las cuentas.
export const ACCENT_PRESETS: Record<string, AccentPreset> = {
  // Amarillo
  '#E1C401': {
    light: { accent: '#E1C401', hover: '#B8A30E', foreground: DARK_INK, solid: '#E1C401', solidHover: '#B8A30E', textOnBg: '#7C6C01' },
    dark: { accent: '#EFD319', hover: '#FACC15', foreground: DARK_INK, solid: '#EFD319', solidHover: '#FACC15' },
  },
  // Verde menta
  '#00D69C': {
    light: { accent: '#00D69C', hover: '#0A9470', foreground: DARK_INK, solid: '#00D69C', solidHover: '#0A9470', textOnBg: '#007656' },
    dark: { accent: '#19EFB5', hover: '#15C999', foreground: DARK_INK, solid: '#19EFB5', solidHover: '#15C999' },
  },
  // Magenta (el default de la app)
  '#FF0055': {
    light: { accent: '#FF0055', hover: '#D6004C', foreground: '#FFFFFF', solid: '#D6004C', solidHover: '#B3003F' },
    dark: { accent: '#FF0055', hover: '#D6004C', foreground: '#FFFFFF', solid: '#D6004C', solidHover: '#B3003F' },
  },
  // Púrpura
  '#811DBC': {
    light: { accent: '#811DBC', hover: '#6A169E', foreground: '#FFFFFF', solid: '#811DBC', solidHover: '#6A169E' },
    dark: { accent: '#811DBC', hover: '#6A169E', foreground: '#FFFFFF', solid: '#811DBC', solidHover: '#6A169E', textAccent: '#AD6CD3' },
  },
  // // Turquesa — el default hasta 2026-10-02 (valores originales de index.css)
  // '#28BDB0': {
  //   light: { accent: '#28BDB0', hover: '#1E988E', foreground: '#062421', solid: '#28BDB0', solidHover: '#1E988E', textOnBg: '#16746C' },
  //   dark: { accent: '#40E0D0', hover: '#55E6D8', foreground: '#062421', solid: '#40E0D0', solidHover: '#55E6D8' },
  // },
  // Azul
  '#3B82F6': {
    light: { accent: '#3B82F6', hover: '#2E64BE', foreground: '#FFFFFF', solid: '#3472D8', solidHover: '#2E64BE', textOnBg: '#2F67C2' },
    dark: { accent: '#5391F7', hover: '#2E64BE', foreground: '#FFFFFF', solid: '#3472D8', solidHover: '#2E64BE' },
  },
  // // Violeta
  // '#8B5CF6': {
  //   light: { accent: '#8B5CF6', hover: '#754DD0', foreground: '#FFFFFF', solid: '#8558EC', solidHover: '#754DD0', textOnBg: '#764ED1' },
  //   dark: { accent: '#9970F7', hover: '#754DD0', foreground: '#FFFFFF', solid: '#8558EC', solidHover: '#754DD0' },
  // },
  // // Rosa
  // '#EC4899': {
  //   light: { accent: '#EC4899', hover: '#B43775', foreground: '#FFFFFF', solid: '#CD3F85', solidHover: '#B43775', textOnBg: '#B33774' },
  //   dark: { accent: '#EE5EA5', hover: '#B43775', foreground: '#FFFFFF', solid: '#CD3F85', solidHover: '#B43775' },
  // },
  // // Ámbar
  // '#F59E0B': {
  //   light: { accent: '#F59E0B', hover: '#D88B0A', foreground: DARK_INK, solid: '#F59E0B', solidHover: '#D88B0A', textOnBg: '#956007' },
  //   dark: { accent: '#F6AA28', hover: '#F7B442', foreground: DARK_INK, solid: '#F6AA28', solidHover: '#F7B442' },
  // },
  // // Verde
  // '#10B981': {
  //   light: { accent: '#10B981', hover: '#0EA372', foreground: DARK_INK, solid: '#10B981', solidHover: '#0EA372', textOnBg: '#0B7C56' },
  //   dark: { accent: '#2DC190', hover: '#46C89D', foreground: DARK_INK, solid: '#2DC190', solidHover: '#46C89D' },
  // },
}

export interface AccentDarkPalette {
  accent: string
  accentHover: string
  accentForeground: string
  accentSolid: string
  accentSolidHover: string
  accentSoftOnDark: string
  accentTextOnDark: string
}

export function deriveAccentPalette(hex: string): AccentPalette {
  const preset = ACCENT_PRESETS[hex.toUpperCase()]
  if (preset) {
    const { light: l, dark: d } = preset
    const darkText = d.textAccent ?? d.accent
    return {
      accent: l.accent,
      accentHover: l.hover,
      accentSoft: lighten(l.accent, 0.85),
      accentSoftOnDark: rgba(d.accent, 0.18),
      accentTextOnBg: l.textOnBg ?? darken(l.accent, 0.35),
      accentTextOnDark: lighten(darkText, 0.45),
      accentForeground: l.foreground,
      accentSolid: l.solid,
      accentSolidHover: l.solidHover,
      dark: {
        // `accent` en oscuro es la versión legible como texto; el relleno
        // exacto de la paleta va en `solid`.
        accent: darkText,
        accentHover: d.hover,
        accentForeground: d.foreground,
        accentSolid: d.solid,
        accentSolidHover: d.solidHover,
        accentSoftOnDark: rgba(d.accent, 0.18),
        accentTextOnDark: lighten(darkText, 0.45),
      },
    }
  }
  const hover = darken(hex, 0.12)
  const foreground = isLight(hex) ? '#0A0A0A' : '#FFFFFF'
  const textOnDark = lighten(hex, 0.45)
  return {
    accent: hex,
    accentHover: hover,
    accentSoft: lighten(hex, 0.85),
    accentSoftOnDark: rgba(hex, 0.18),
    accentTextOnBg: darken(hex, 0.35),
    // 0.45 reproduce la proporción de los defaults: #40E0D0 aclarado así da
    // ≈#96EEE5, casi el #A8F2EC que el diseño usaba en modo oscuro.
    accentTextOnDark: textOnDark,
    accentForeground: foreground,
    accentSolid: hex,
    accentSolidHover: hover,
    dark: {
      accent: hex,
      accentHover: hover,
      accentForeground: foreground,
      accentSolid: hex,
      accentSolidHover: hover,
      accentSoftOnDark: rgba(hex, 0.18),
      accentTextOnDark: textOnDark,
    },
  }
}
