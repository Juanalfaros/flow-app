import { createFileRoute } from '@tanstack/react-router'
import { PublicLinkView } from '@/features/sharing/components/PublicLinkView'

// Ruta pública (0085_public_links.sql): sin sesión, fuera de `_app` a
// propósito — no debe pasar por ningún `beforeLoad` que redirija a
// /login. El token en el path (no query param) hace que compartir la
// URL completa sea lo único que hace falta.
export const Route = createFileRoute('/enlace/$token')({
  component: PublicLinkPage,
})

function PublicLinkPage() {
  const { token } = Route.useParams()
  return <PublicLinkView token={token} />
}
