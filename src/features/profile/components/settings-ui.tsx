import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@/lib/utils'

// Primitivas de layout de Ajustes (mockup "Ajustes de Flow" v2). Traducen la
// estructura del mockup a los tokens del proyecto — de ahí se toma la
// proporción y la jerarquía, no los colores: el acento y los fondos los
// define el tema de la cuenta (accent_color/rail_style/theme), no el mockup.
//
// `@min-[620px]:`, no `sm:`/`md:`: el ancestro real es `<main>` en
// AppShell.tsx, que es `@container` a propósito (ver su comentario). Con
// sidebar abierto el viewport puede ser ancho y esta columna angosta igual,
// así que lo que manda es el ancho de ESTE contenedor — mismo criterio que
// PageShell.tsx y el `@container set` del mockup.

/**
 * Sección de ajustes: título y descripción a la izquierda, controles a la
 * derecha, separadas de la anterior por una línea.
 *
 * Reemplaza a la versión con ícono y una sola columna: el mockup apoya toda
 * la lectura de la página en esa columna de títulos fija, que es lo que deja
 * escanear "qué hay acá" sin leer cada control.
 */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'grid grid-cols-1 gap-3 border-t border-border py-[18px] first:border-t-0 first:pt-0',
        '@min-[620px]:grid-cols-[220px_minmax(0,1fr)] @min-[620px]:gap-6 @min-[620px]:py-[22px]',
        className,
      )}
    >
      <div>
        <h2 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-3.5">{children}</div>
    </section>
  )
}

/** Par de campos que se apila en una sola columna cuando no hay ancho. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-3 @min-[620px]:grid-cols-2', className)}>{children}</div>
}

/** Etiqueta + control + ayuda opcional. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label?: ReactNode
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label !== undefined &&
        (htmlFor ? (
          <label htmlFor={htmlFor} className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            {label}
          </label>
        ) : (
          <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium">{label}</span>
        ))}
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-text-muted">{hint}</span>}
    </div>
  )
}

/** Caja con aspecto de input pero de solo lectura (dirección, "Reporta a"). */
export function ReadonlyBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-9 min-w-0 items-center gap-2 rounded-md border border-border bg-surface-alt px-2.5 text-[13px] text-text-secondary',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Fila con ícono, texto principal, subtítulo y una acción a la derecha.
 *
 * `wrap`: en angosto la acción baja a su propia línea alineada con el texto
 * (no con el ícono) en vez de comprimir el subtítulo hasta romperlo — el
 * `.row.wrapm` del mockup.
 */
export function SettingRow({
  icon,
  title,
  subtitle,
  action,
  wrap,
  className,
}: {
  icon?: Parameters<typeof HugeiconsIcon>[0]['icon']
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  wrap?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', wrap && 'flex-wrap @min-[620px]:flex-nowrap', className)}>
      {icon && (
        <span className="grid size-[30px] shrink-0 place-items-center rounded-md bg-surface-alt text-text-secondary">
          <HugeiconsIcon icon={icon} className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{title}</div>
        {subtitle && <div className="text-xs text-text-muted">{subtitle}</div>}
      </div>
      {/* `basis-full` en angosto: sin eso el botón se queda en la misma
          línea y lo que se comprime es el texto, que termina partido en
          cuatro renglones. Alineado con el texto (42px = ícono + gap), no
          con el ícono. */}
      {action && (
        <div className={cn('shrink-0', wrap && 'ml-[42px] basis-full @min-[620px]:ml-0 @min-[620px]:basis-auto')}>
          {action}
        </div>
      )}
    </div>
  )
}

/** Filas separadas por una línea, sin borde exterior. */
export function SettingList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col [&>*]:border-t [&>*]:border-border [&>*]:py-2.5 [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0.5',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Grupo de botones que envuelve en pantallas angostas. */
export function Actions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

export function Note({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'warn'; className?: string }) {
  return <p className={cn('text-xs', tone === 'warn' ? 'text-warn-text' : 'text-text-muted', className)}>{children}</p>
}

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'ok' | 'warn'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap',
        tone === 'ok' && 'bg-success-bg text-success-text',
        tone === 'warn' && 'bg-warn-bg text-warn-text',
        tone === 'neutral' && 'bg-surface-alt text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Control segmentado: dos o tres opciones cortas y excluyentes, todas
 * visibles a la vez. Se usa donde un `<select>` escondería opciones que
 * caben perfectamente (24h/12h, Lunes/Domingo, dónde abrir una tarea).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex w-fit flex-wrap gap-0.5 rounded-[9px] bg-surface-alt p-[3px]', className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[7px] px-2.5 py-1 text-xs transition-colors',
              selected ? 'bg-surface font-medium text-text shadow-sm' : 'text-text-secondary hover:text-text',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
