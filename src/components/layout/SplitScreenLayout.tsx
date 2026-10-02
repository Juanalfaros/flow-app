import type { ReactNode } from 'react'
import { useLoginBranding } from '@/features/workspace/queries'

interface SplitScreenLayoutProps {
  tagline: string
  children: ReactNode
}

export function SplitScreenLayout({ tagline, children }: SplitScreenLayoutProps) {
  // Pública, sin sesión (0077_workspace_branding.sql) — login/accept-invite/
  // reset-password son las únicas pantallas que corren antes de autenticarse.
  const { data: branding } = useLoginBranding()
  const logoUrl = branding?.logo_url ?? null
  const backgroundUrl = branding?.login_background_url ?? null

  return (
    <div className="grid min-h-svh grid-cols-1 bg-bg text-text md:grid-cols-2">
      <div
        className="relative hidden flex-col justify-between overflow-hidden bg-accent-solid bg-cover bg-center p-10 md:flex"
        style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
      >
        {/* Overlay solo cuando hay foto de fondo: sin ella el texto ya
            tiene el contraste pensado contra `--accent` sólido; con una
            imagen cualquiera, ese contraste ya no está garantizado. */}
        {backgroundUrl && <div className="absolute inset-0 bg-black/35" aria-hidden />}
        <span className="relative font-mono text-sm tracking-wide text-accent-foreground">Flow</span>
        <p className="relative max-w-xs text-2xl leading-snug font-medium text-accent-foreground">{tagline}</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-xs">
          {/* El panel de marca de la izquierda es `hidden md:flex`, así que en
              móvil —de donde llega buena parte del tráfico, porque los enlaces
              de acceso se abren desde el correo del teléfono— la pantalla
              quedaba como un formulario suelto sobre fondo blanco, sin nombre
              de producto ni contexto de dónde aterrizaste. Esta cabecera
              aparece solo cuando el panel no está. */}
          <div className="mb-8 flex flex-col gap-1 md:hidden">
            <span className="font-mono text-sm tracking-wide text-accent-text-on-bg">Flow</span>
            <p className="text-sm text-text-secondary">{tagline}</p>
          </div>
          {/* Logo propio (0077) sobre el formulario — pedido explícito del
              usuario, distinto del wordmark de texto del panel izquierdo:
              este va siempre arriba del form, en las dos columnas. */}
          {logoUrl && <img src={logoUrl} alt="" className="mb-6 max-h-10 w-auto object-contain" />}
          {children}
        </div>
      </div>
    </div>
  )
}
