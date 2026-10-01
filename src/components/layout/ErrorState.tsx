import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, ArrowLeft02Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

// Un rechazo de RLS llega como PostgrestError, no como Error — el `message`
// existe igual, pero conviene distinguirlo para no mostrarle al usuario un
// texto de Postgres. `code` 42501 es el que lanzan los asserts de
// 0017_rpc_authz.sql; PGRST301 es "JWT expirado/inválido".
function describeError(error: unknown): { title: string; detail: string; canRetry: boolean } {
  const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined

  if (code === '42501') {
    return {
      title: 'No tienes acceso a esto',
      detail: 'Puede que te hayan quitado del workspace o que el enlace sea de otra cuenta.',
      canRetry: false,
    }
  }
  if (code === 'PGRST301') {
    return {
      title: 'Tu sesión expiró',
      detail: 'Vuelve a iniciar sesión para continuar.',
      canRetry: false,
    }
  }
  if (!navigator.onLine) {
    return {
      title: 'Sin conexión',
      detail: 'Tus cambios se guardan localmente y se sincronizan al volver la red.',
      canRetry: true,
    }
  }
  return {
    title: 'Algo salió mal',
    detail: 'No pudimos cargar esta vista. Vuelve a intentarlo en unos segundos.',
    canRetry: true,
  }
}

interface ErrorStateProps {
  error: unknown
  /** `reset` del errorComponent de TanStack Router, si lo hay. */
  onRetry?: () => void
  /** Enlace de escape; por defecto vuelve al inicio. */
  homeLabel?: string
}

export function ErrorState({ error, onRetry, homeLabel = 'Volver al inicio' }: ErrorStateProps) {
  const { title, detail, canRetry } = describeError(error)

  return (
    <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-alt">
        <HugeiconsIcon icon={Alert02Icon} className="size-5 text-text-secondary" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="max-w-sm text-xs text-text-secondary">{detail}</p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        {canRetry && onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <HugeiconsIcon icon={RefreshIcon} />
            Reintentar
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link to="/">
            <HugeiconsIcon icon={ArrowLeft02Icon} />
            {homeLabel}
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function NotFoundState() {
  return (
    <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-alt">
        <HugeiconsIcon icon={Alert02Icon} className="size-5 text-text-secondary" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Esta página no existe</h2>
        <p className="max-w-sm text-xs text-text-secondary">
          Puede que el contenido se haya eliminado o que el enlace esté incompleto.
        </p>
      </div>
      <Button size="sm" variant="ghost" asChild className="mt-1">
        <Link to="/">
          <HugeiconsIcon icon={ArrowLeft02Icon} />
          Volver al inicio
        </Link>
      </Button>
    </div>
  )
}
