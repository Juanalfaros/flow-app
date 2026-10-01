import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Logout01Icon, UserCircleIcon } from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/features/auth/api'
import { useSession } from '@/features/auth/queries'
import { useProfile } from '@/features/profile/queries'
import { initials } from '@/lib/initials'

export function UserMenu() {
  const { data: session } = useSession()
  const userId = session?.user.id ?? ''
  const { data: profile } = useProfile(userId)
  const queryClient = useQueryClient()
  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: () => queryClient.clear(),
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // El control más usado del Topbar (abre perfil/cerrar sesión) era
          // también el más chico: solo el Avatar (24px), sin padding
          // propio. size-10 (40px) crece el área de toque sin agrandar el
          // avatar visual, que se mantiene en size="sm".
          className="flex size-10 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
          aria-label="Menú de usuario"
        >
          <Avatar size="sm">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            {/* El email no se pasa por `initials()`: no tiene espacios, así
                que daría una sola letra ("j" de juan.perez@…). Las 2 primeras
                letras identifican mejor cuando todavía no hay nombre. */}
            <AvatarFallback>
              {profile?.full_name
                ? initials(profile.full_name)
                : (session?.user.email?.slice(0, 2).toUpperCase() ?? '?')}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="max-w-64 truncate px-2 py-1.5 text-xs text-text-muted">{session?.user.email}</div>
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <HugeiconsIcon icon={UserCircleIcon} />
            Mi perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOutMutation.mutate()}
          disabled={signOutMutation.isPending}
        >
          <HugeiconsIcon icon={Logout01Icon} />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
