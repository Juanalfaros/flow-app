import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useTheme } from 'next-themes'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { useUpdateProfileMutation } from '@/features/profile/mutations'
import { deriveAccentPalette, deriveRailPalette, type RailStyle } from '@/lib/color'

export type ThemePreference = 'light' | 'dark' | 'system'

// Fuente de verdad del tema: antes vivía solo en localStorage (next-themes),
// así que elegirlo en un dispositivo no viajaba a los demás. Ahora
// `profiles.theme` (0058_profile_preferences.sql) es la fuente real — este
// hook sincroniza next-themes hacia el valor de la cuenta al montar/cambiar,
// y cualquier cambio (acá, desde ThemeToggle, o desde Preferencias) escribe
// ambos lados. Se usa desde ThemeToggle (Topbar, siempre montado dentro de
// AppShell) y desde PreferencesSection — cualquiera de los dos dispara el
// sync inicial, según cuál monte primero.
export function useThemePreference() {
  const { data: session } = useSession()
  const userId = session?.user.id ?? ''
  const { data: profile } = useProfile(userId)
  const { resolvedTheme, theme: localTheme, setTheme: setLocalTheme } = useTheme()
  const updateProfileMutation = useUpdateProfileMutation(userId)

  useEffect(() => {
    if (!profile) return
    if (profile.theme !== localTheme) setLocalTheme(profile.theme)
    // Solo debe reaccionar a cambios del perfil (o al montar) — `localTheme`
    // es el valor que este mismo efecto puede estar por escribir, incluirlo
    // como dependencia lo haría correr una vez de más sin motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.theme])

  // Color de acento: se aplica como custom properties en :root, derivando
  // hover/soft/foreground desde el hex guardado (ver src/lib/color.ts) para
  // que ningún estado quede a medio re-tematizar.
  //
  // Se escribe la familia `--accent-user-*`, NO `--accent` directo: los
  // tokens reales se declaran en index.css como
  // `var(--accent-user-*, <default>)`. Pisar `--accent` acá no alcanzaba —
  // `.dark-scope` (tab bar móvil, hoja "Más", Sidebar) lo redeclara sobre
  // sí misma, y una declaración propia le gana al valor heredado aunque
  // ese venga de un estilo inline de <html>. Se veía como un FAB del color
  // elegido junto a una tab bar en el turquesa por defecto.
  useEffect(() => {
    const root = document.documentElement.style
    const VARS = [
      '--accent-user',
      '--accent-user-hover',
      '--accent-user-soft',
      '--accent-user-soft-on-dark',
      '--accent-user-text-on-bg',
      '--accent-user-text-on-dark',
      '--accent-user-foreground',
      '--accent-user-solid',
      '--accent-user-solid-hover',
    ] as const

    // Volver a "sin color elegido" tiene que LIMPIAR, no dejar el anterior
    // pegado: las custom properties inline sobreviven a cualquier
    // re-render, no hay nada que las quite solo.
    if (!profile?.accent_color) {
      for (const name of VARS) root.removeProperty(name)
      return
    }

    const palette = deriveAccentPalette(profile.accent_color)
    root.setProperty('--accent-user', palette.accent)
    root.setProperty('--accent-user-hover', palette.accentHover)
    root.setProperty('--accent-user-soft', palette.accentSoft)
    root.setProperty('--accent-user-soft-on-dark', palette.accentSoftOnDark)
    root.setProperty('--accent-user-text-on-bg', palette.accentTextOnBg)
    root.setProperty('--accent-user-text-on-dark', palette.accentTextOnDark)
    root.setProperty('--accent-user-foreground', palette.accentForeground)
    root.setProperty('--accent-user-solid', palette.accentSolid)
    root.setProperty('--accent-user-solid-hover', palette.accentSolidHover)
  }, [profile?.accent_color])

  // Fondo del riel (0090_profile_rail_style.sql). Va aparte del efecto de
  // arriba porque depende de DOS campos: el acento y el modo elegido. Las
  // tres variables se escriben siempre, incluso en 'grafito' — así el riel
  // no necesita saber si hay preferencia o no, y volver a grafito repinta
  // con los mismos valores que tiene el scope oscuro por defecto en vez de
  // dejar las properties viejas pegadas.
  const accentColor = profile?.accent_color
  const railStyle = profile?.rail_style
  useEffect(() => {
    if (!accentColor) return
    const rail = deriveRailPalette(accentColor, (railStyle ?? 'grafito') as RailStyle)
    const root = document.documentElement.style
    root.setProperty('--rail-bg', rail.bg)
    root.setProperty('--rail-border', rail.border)
    root.setProperty('--rail-active-bg', rail.activeBg)
    root.setProperty('--rail-active-fg', rail.activeFg)
  }, [accentColor, railStyle])

  // Antes esto era una transición CSS por elemento (`transition-colors` +
  // una regla global en index.css) — con un árbol tan variado (cientos de
  // nodos, cada uno con su propia combinación de clases/capas de
  // Tailwind), no todos terminan animando exactamente el mismo color en
  // la misma ventana de tiempo, así que se veía como que "unas cosas
  // cambian antes que otras" (reportado por el usuario). La View
  // Transitions API hace un solo crossfade de toda la pantalla (captura
  // el ANTES y el DESPUÉS como dos imágenes y funde una en la otra) en
  // vez de animar cada color por separado — no hay forma de que se
  // desincronice porque no es N animaciones, es una sola.
  // `flushSync`: sin esto, `setLocalTheme` (un setState de React por
  // debajo) se aplica en el próximo commit, después de que la API ya
  // sacó la foto del estado "después" — el crossfade saldría vacío.
  // Se degrada solo (sin la API, o con prefers-reduced-motion) al mismo
  // cambio instantáneo de siempre.
  function setTheme(next: ThemePreference) {
    const apply = () => {
      setLocalTheme(next)
      if (userId) updateProfileMutation.mutate({ theme: next })
    }
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!document.startViewTransition || prefersReducedMotion) {
      apply()
      return
    }
    document.startViewTransition(() => flushSync(apply))
  }

  return {
    theme: (profile?.theme as ThemePreference | undefined) ?? (localTheme as ThemePreference),
    resolvedTheme,
    setTheme,
  }
}
