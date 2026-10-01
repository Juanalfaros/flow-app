import { useMemo } from 'react'
import { isToday, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { useSetNodeSearchParam } from '@/lib/node-param'
import { useGoogleCalendar, useGoogleConnection, useConnectGoogleMutation } from '@/features/people/google-calendar'
import { isClosedStatus } from '@/features/projects/status-kind'
import type { FocusTaskRow } from '@/features/home/queries'
import { cn } from '@/lib/utils'

interface TimedEvent {
  id: string
  kind: 'cal' | 'task'
  title: string
  startHour: number
  endHour: number | null
  link: string | null
  taskId: string | null
}

const DEFAULT_H0 = 8
const DEFAULT_H1 = 19
const PX_PER_HOUR = 44
// Bajo esta duración un evento se ve como una píldora horizontal (hora +
// título en una sola línea) en vez del bloque vertical de siempre — igual
// que mockup ".ev.cal.short": a 44px/hora, un evento de 20 min mide 15px,
// muy poco para acomodar título arriba y hora abajo.
const SHORT_EVENT_THRESHOLD_HOURS = 0.75

function formatHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return mm === 0 ? `${hh}:00` : `${hh}:${String(mm).padStart(2, '0')}`
}

function timeLabel(e: TimedEvent): string {
  if (e.endHour != null && e.endHour > e.startHour) return `${formatHour(e.startHour)} – ${formatHour(e.endHour)}`
  return formatHour(e.startHour)
}

interface AgendaSectionProps {
  workspaceId: string
  openTasks: FocusTaskRow[]
}

// "Tu agenda" (mockup https://claude.ai/artifact/F353ztRYbFpxDKGub3ZMKy):
// eventos de Google Calendar de HOY (`?range=today`, ver worker/google.ts)
// y tareas con `due_time` de hoy, en una sola línea de tiempo. Sin Google
// conectado se sigue mostrando la agenda solo con las tareas con hora, más
// un botón para conectar — tal como pide el mockup, en vez de esconder la
// sección entera.
export function AgendaSection({ workspaceId, openTasks }: AgendaSectionProps) {
  const setNode = useSetNodeSearchParam()
  const { data: calendar, isPending: calendarPending } = useGoogleCalendar('today')
  const { data: connection } = useGoogleConnection()
  const connect = useConnectGoogleMutation(workspaceId)

  const connected = calendar?.connected === true

  const events = useMemo<TimedEvent[]>(() => {
    const calEvents: TimedEvent[] = connected
      ? (calendar?.events ?? [])
          .filter((e) => !e.allDay && e.startsAt)
          .map((e) => ({
            id: `cal-${e.id}`,
            kind: 'cal' as const,
            title: e.title,
            startHour: hourFractionFromIso(e.startsAt!),
            endHour: e.endsAt ? hourFractionFromIso(e.endsAt) : null,
            link: e.link,
            taskId: null,
          }))
      : []

    const taskEvents: TimedEvent[] = openTasks
      .filter((t) => !isClosedStatus(t.status?.status_kind) && t.due_time && t.due_date && isToday(parseISO(t.due_date)))
      .map((t) => ({
        id: `task-${t.id}`,
        kind: 'task' as const,
        title: t.title,
        startHour: hourFractionFromTimeString(t.due_time!),
        endHour: null,
        link: null,
        taskId: t.id,
      }))

    return [...calEvents, ...taskEvents].sort((a, b) => a.startHour - b.startHour)
  }, [calendar, connected, openTasks])

  const calCount = events.filter((e) => e.kind === 'cal').length
  const taskCount = events.filter((e) => e.kind === 'task').length

  const hours = events.flatMap((e) => [e.startHour, e.endHour ?? e.startHour])
  const h0 = hours.length > 0 ? Math.min(DEFAULT_H0, Math.floor(Math.min(...hours))) : DEFAULT_H0
  const h1 = hours.length > 0 ? Math.max(DEFAULT_H1, Math.ceil(Math.max(...hours))) : DEFAULT_H1
  const trackHeight = (h1 - h0) * PX_PER_HOUR

  const now = new Date()
  const nowHour = now.getHours() + now.getMinutes() / 60
  const showNow = nowHour >= h0 && nowHour <= h1

  function y(h: number): number {
    return (h - h0) * PX_PER_HOUR
  }

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Tu agenda</h2>
        {(calCount > 0 || taskCount > 0) && (
          <span className="text-xs text-text-muted">
            {calCount > 0 && `${calCount} reunión${calCount === 1 ? '' : 'es'}`}
            {calCount > 0 && taskCount > 0 && ' · '}
            {taskCount > 0 && `${taskCount} tarea${taskCount === 1 ? '' : 's'} con hora`}
          </span>
        )}
      </div>

      {calendarPending ? (
        <div className="h-64 animate-pulse rounded-lg bg-surface-alt/60" />
      ) : events.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-alt/40 px-4 py-6 text-center text-sm text-text-muted">
          Nada agendado por ahora.
        </p>
      ) : (
        <div className="grid grid-cols-[42px_minmax(0,1fr)]">
          <div className="flex flex-col">
            {Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i).map((h) => (
              <span key={h} className="-translate-y-[7px] font-mono text-[10.5px] text-text-muted" style={{ height: PX_PER_HOUR }}>
                {h}:00
              </span>
            ))}
          </div>
          <div className="relative border-l border-border" style={{ height: trackHeight }}>
            {Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i).map((h) => (
              <span key={h} className="absolute right-0 left-0 h-px bg-border/60" style={{ top: y(h) }} />
            ))}

            {events.map((e) =>
              e.kind === 'cal' ? (
                <CalEventPill key={e.id} event={e} top={y(e.startHour)} />
              ) : (
                <TaskEventPill key={e.id} event={e} top={y(e.startHour)} onOpen={() => e.taskId && setNode(e.taskId)} />
              ),
            )}

            {showNow && (
              <div className="absolute right-0 left-[-5px] z-10 h-0.5 bg-danger" style={{ top: y(nowHour) }}>
                <span className="absolute top-[-3px] left-0 size-2 rounded-full bg-danger" />
                <span className="absolute top-[-17px] right-0 font-mono text-[10px] text-danger">{formatHour(nowHour)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11.5px] text-text-muted">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-[9px] rounded-sm bg-status-inprogress" />
            Google Calendar
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-[9px] rounded-sm bg-accent" />
            Tarea con hora
          </span>
        </div>
        {connected ? (
          connection?.google_email && <span>Conectado como {connection.google_email}</span>
        ) : (
          <Button type="button" variant="outline" size="xs" disabled={connect.isPending} onClick={() => connect.mutate()}>
            {connect.isPending ? 'Abriendo Google…' : 'Conectar Google Calendar'}
          </Button>
        )}
      </div>
    </section>
  )
}

function CalEventPill({ event, top }: { event: TimedEvent; top: number }) {
  const duration = event.endHour != null ? event.endHour - event.startHour : 0
  const short = duration > 0 && duration < SHORT_EVENT_THRESHOLD_HOURS
  const height = duration > 0 ? Math.max(duration * PX_PER_HOUR - 2, 20) : 26

  const content = short ? (
    <span className="flex h-full items-center gap-2 truncate">
      <span className="shrink-0 font-mono text-[10.5px] opacity-85">{timeLabel(event)}</span>
      <span className="truncate font-medium">{event.title}</span>
    </span>
  ) : (
    <span className="flex flex-col overflow-hidden">
      <span className="truncate font-medium">{event.title}</span>
      <span className="font-mono text-[10.5px] opacity-85">{timeLabel(event)}</span>
    </span>
  )

  const className = 'absolute right-1 left-2 overflow-hidden rounded-md border-l-[3px] border-status-inprogress bg-status-inprogress-bg px-2 py-1 text-[12px] text-status-inprogress'

  return event.link ? (
    <a href={event.link} target="_blank" rel="noreferrer" className={cn(className, 'hover:brightness-95')} style={{ top, height }}>
      {content}
    </a>
  ) : (
    <div className={className} style={{ top, height }}>
      {content}
    </div>
  )
}

function TaskEventPill({ event, top, onOpen }: { event: TimedEvent; top: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Tarea que vence a las ${timeLabel(event)}`}
      className="absolute left-2 flex h-[26px] max-w-[60%] min-w-0 items-center gap-2 overflow-hidden rounded-md border-l-[3px] border-accent bg-accent/15 px-2 text-[12px] text-accent-text-on-bg"
      style={{ top: top - 13 }}
    >
      <span className="shrink-0 font-mono text-[10.5px] opacity-85">{timeLabel(event)}</span>
      <span className="truncate font-medium">{event.title}</span>
    </button>
  )
}

function hourFractionFromIso(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

function hourFractionFromTimeString(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}
