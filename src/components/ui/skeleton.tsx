import { cn } from '@/lib/utils'

// Primitiva estándar de shadcn, con los tokens de este proyecto en vez de
// `bg-accent` (que acá es el turquesa de marca, no un gris — ver index.css):
// `--surface-alt` es el gris de superficie y funciona en claro y oscuro.
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-alt', className)}
      {...props}
    />
  )
}
