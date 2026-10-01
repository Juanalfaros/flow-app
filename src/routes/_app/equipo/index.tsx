import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/equipo/')({
  // /equipo no tiene contenido propio: las tres vistas son hermanas y
  // "Todas las personas" es la de entrada, igual que en la referencia.
  beforeLoad: () => {
    throw redirect({ to: '/equipo/personas' })
  },
})
