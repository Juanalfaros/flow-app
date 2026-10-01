import { Link, useMatchRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  UserCircleIcon,
  Shield01Icon,
  Building06Icon,
  BellIcon,
  Globe02Icon,
  Plug01Icon,
  Copy01Icon,
  Archive01Icon,
  ListSettingIcon,
  ViewOffIcon,
  ViewIcon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { useSession } from '@/features/auth/queries'
import { useHiddenNodes } from '@/features/hidden-nodes/queries'
import { useToggleHiddenNodeMutation } from '@/features/hidden-nodes/mutations'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const navItemClass =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text hover:bg-surface-alt transition-colors'
const activeNavItemClass = 'text-accent font-medium'

// Perfil/Seguridad/Notificaciones/Preferencias/Integraciones/Zona de
// peligro/Espacio de trabajo son las 7 pestañas de /profile (search param
// `tab`, ver routes/_app/profile.tsx) — linkear directo evita pasar primero
// por "Perfil". Mismo NOMBRE que usa profile.tsx para cada una. "Seguridad"
// se suma acá (rediseño 2026-09-24: salió de lo que antes era "Cuenta",
// pasa a tener pestaña propia). Sin "Miembros e invitaciones" aparte: ya
// vive en la pestaña "Espacio de trabajo" de /profile, y sería una segunda
// entrada al mismo lugar que Equipo → Personas.
const PROFILE_ITEMS = [
  { tab: 'perfil', icon: UserCircleIcon, label: 'Perfil' },
  { tab: 'seguridad', icon: Shield01Icon, label: 'Seguridad' },
  { tab: 'notifications', icon: BellIcon, label: 'Notificaciones' },
  { tab: 'preferences', icon: Globe02Icon, label: 'Preferencias' },
  { tab: 'integrations', icon: Plug01Icon, label: 'Integraciones' },
  { tab: 'danger', icon: Delete02Icon, label: 'Zona de peligro', danger: true },
  { tab: 'workspace', icon: Building06Icon, label: 'Espacio de trabajo' },
] as const

const WORKSPACE_ITEMS = [
  { to: '/plantillas', icon: Copy01Icon, label: 'Plantillas' },
  { to: '/campos-personalizados', icon: ListSettingIcon, label: 'Campos personalizados' },
  { to: '/archivados', icon: Archive01Icon, label: 'Archivados' },
] as const

export function AjustesPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = useSession()
  const matchRoute = useMatchRoute()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Perfil y cuenta</span>
        {PROFILE_ITEMS.map((item) => {
          const active = !!matchRoute({ to: '/profile', search: { tab: item.tab } })
          const danger = 'danger' in item && item.danger
          return (
            <Link
              key={item.tab}
              to="/profile"
              search={{ tab: item.tab }}
              onClick={onNavigate}
              className={cn(
                navItemClass,
                danger && (active ? 'bg-danger-bg text-danger-text' : 'text-danger hover:bg-danger-bg'),
                !danger && active && activeNavItemClass,
              )}
            >
              <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="px-1.5 text-xs font-medium text-text-muted uppercase">Espacio de trabajo</span>
        {WORKSPACE_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(navItemClass, !!matchRoute({ to: item.to }) && activeNavItemClass)}
          >
            <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
        <HiddenNodesMenu userId={session?.user.id} />
      </div>
    </div>
  )
}

// "Espacios ocultos": único lugar para deshacer "Ocultar espacio"
// (NodeTreeItem.tsx) — no se muestra si no hay ninguno oculto. Puerto
// textual del mismo componente que vivía en Sidebar.tsx, sin la variante
// `collapsed` (el panel nunca está colapsado).
function HiddenNodesMenu({ userId }: { userId: string | undefined }) {
  const { data: hidden } = useHiddenNodes(userId)
  const unhideMutation = useToggleHiddenNodeMutation(userId)

  if (!hidden || hidden.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={navItemClass}>
          <HugeiconsIcon icon={ViewOffIcon} className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">Espacios ocultos</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Espacios ocultos</DropdownMenuLabel>
        {hidden.map((h) => (
          <DropdownMenuItem
            key={h.node_id}
            onSelect={() =>
              unhideMutation.mutate(
                { nodeId: h.node_id, isHidden: true },
                { onError: () => toast.error('No se pudo restaurar el espacio.') },
              )
            }
          >
            <HugeiconsIcon icon={ViewIcon} />
            <span className="flex-1 truncate">{h.node?.name ?? 'Espacio eliminado'}</span>
            <span className="ml-1 shrink-0 text-[10px] text-text-muted">Restaurar</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
