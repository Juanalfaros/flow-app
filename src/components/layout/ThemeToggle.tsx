import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Moon02Icon, Sun01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { useThemePreference } from '@/features/profile/use-theme-preference'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useThemePreference()
  // Evita un frame con el ícono equivocado antes de que next-themes lea
  // la preferencia guardada (localStorage/prefers-color-scheme) al montar.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      // size-10 (40px) pisa el size-7 (28px) de "icon-sm" — solo usado en
      // el Topbar, área de toque táctil; el ícono (size-4) no cambia.
      className="relative size-10 overflow-hidden"
    >
      <HugeiconsIcon
        icon={Sun01Icon}
        className={cn(
          'absolute size-4 transition-all duration-300 ease-out',
          isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
      />
      <HugeiconsIcon
        icon={Moon02Icon}
        className={cn(
          'absolute size-4 transition-all duration-300 ease-out',
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        )}
      />
    </Button>
  )
}
