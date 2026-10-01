import { createFileRoute, redirect } from '@tanstack/react-router'

// `/members` se convirtió en `/equipo` (personas, equipos y organigrama). Se
// mantiene como redirect y no se elimina porque la ruta vieja está en el
// historial de los navegadores del equipo y en enlaces ya compartidos.
export const Route = createFileRoute('/_app/members')({
  beforeLoad: () => {
    throw redirect({ to: '/equipo/personas' })
  },
})
