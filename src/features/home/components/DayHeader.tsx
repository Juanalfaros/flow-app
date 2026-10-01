import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Clock01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { QuickCreateTaskDialog } from '@/features/home/components/QuickCreateTaskDialog'
import { QuickTimeEntryDialog } from '@/features/home/components/QuickTimeEntryDialog'

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTH = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// 5–11: madrugada todavía cuenta como "noches" (mismo corte que usa la
// gente al hablar, no medianoche); 12–19: tarde; el resto, noche.
function greetingForHour(hour: number): string {
  if (hour >= 6 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/**
 * Saludo + frase del día + acciones. La frase se arma con reglas simples
 * (sin IA, como aclara el mockup): cuenta lo que ya se pidió para
 * "Necesita tu acción" y lo dice en una oración, en vez de que la persona
 * tenga que leer 4 listas para enterarse de lo mismo.
 */
export function DayHeader({
  firstName,
  workspaceId,
  userId,
  overdueCount,
  dueTodayCount,
  firstDueTime,
  pendingReviewCount,
}: {
  firstName: string | undefined
  workspaceId: string
  userId: string | undefined
  overdueCount: number
  dueTodayCount: number
  firstDueTime: string | null
  pendingReviewCount: number
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const now = new Date()

  return (
    <div className="flex flex-wrap items-end gap-5">
      {/* `min-w-[240px]`, no `min-w-0`: con `flex-1` (flex-basis 0) y
          `min-w-0`, Flexbox nunca considera que este bloque "no entra" al
          lado de los botones — lo sigue comprimiendo hasta casi 0px en vez
          de mandar los botones a su propia fila (`flex-wrap` de arriba),
          y ahí es donde cada palabra del saludo termina en su propia
          línea. Un mínimo real es lo que hace que Flexbox SÍ decida
          envolver antes de seguir angostando el texto — reportado por el
          usuario en mobile real, varios dispositivos/navegadores. */}
      <div className="min-w-[240px] flex-1">
        <span className="font-mono text-[11.5px] tracking-wide text-accent-text-on-bg uppercase">
          {WEEKDAY[now.getDay()]} {now.getDate()} de {MONTH[now.getMonth()]}
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {firstName ? `${greetingForHour(now.getHours())}, ${firstName}` : greetingForHour(now.getHours())}
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-[15px] text-text-secondary">{buildBrief({ overdueCount, dueTodayCount, firstDueTime, pendingReviewCount })}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setTimeOpen(true)}>
          <HugeiconsIcon icon={Clock01Icon} />
          Registrar tiempo
        </Button>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <HugeiconsIcon icon={PlusSignIcon} />
          Nueva tarea
        </Button>
      </div>
      <QuickCreateTaskDialog workspaceId={workspaceId} open={createOpen} onOpenChange={setCreateOpen} />
      <QuickTimeEntryDialog workspaceId={workspaceId} userId={userId} open={timeOpen} onOpenChange={setTimeOpen} />
    </div>
  )
}

function buildBrief({
  overdueCount,
  dueTodayCount,
  firstDueTime,
  pendingReviewCount,
}: {
  overdueCount: number
  dueTodayCount: number
  firstDueTime: string | null
  pendingReviewCount: number
}): string {
  const parts: string[] = []

  if (dueTodayCount > 0) {
    parts.push(
      `Hoy vence${dueTodayCount === 1 ? '' : 'n'} ${dueTodayCount} tarea${dueTodayCount === 1 ? '' : 's'}${firstDueTime ? `, la primera a las ${firstDueTime.slice(0, 5)}` : ''}.`,
    )
  }
  if (overdueCount > 0) {
    parts.push(`Tienes ${overdueCount} vencida${overdueCount === 1 ? '' : 's'}${pendingReviewCount > 0 ? ' y' : '.'}`)
  }
  if (pendingReviewCount > 0) {
    const lead = overdueCount > 0 ? '' : 'Tienes '
    parts.push(`${lead}${pendingReviewCount} revisión${pendingReviewCount === 1 ? '' : 'es'} esperándote.`)
  }

  if (parts.length === 0) return 'Día despejado: nada vence hoy.'
  return parts.join(' ')
}
