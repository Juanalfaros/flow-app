import { adminClient } from './notification-payload'
import { APP_ORIGIN, escapeHtml, renderEmailButton, renderEmailShell, sendBrandedEmail } from './email-template'
import { localWeekdayAndHour } from './local-time'
import type { Env } from './index'

// Resumen semanal por correo (Fase 4 de la auditoría de seguridad/bugs,
// 2026-09-09) — hasta acá `weekly_digest_enabled`/`last_digest_sent_at`
// (0058_profile_preferences.sql) eran un control fantasma: la
// preferencia persistía en Perfil pero ningún cron la leía.
//
// Rediseño de Ajustes, PR 3 (2026-09-25): día y hora elegibles por persona
// (`profiles.digest_day`/`digest_hour`, 0092_notification_preferences.sql)
// en vez del `DIGEST_DAY_OF_WEEK` fijo que había antes. Para que la hora
// elegida se respete de verdad (no solo el día) el cron compartido con
// `sweepDueReminders` pasó de una corrida diaria a una por hora
// (`HOURLY_CRON` en worker/index.ts) — cada invocación calcula la hora y
// el día LOCAL de cada persona con `Intl.DateTimeFormat` y solo actúa si
// calzan.
// `sweepDueReminders` ya era idempotente vía `due_reminder_sent_at`, así
// que correr 24x más seguido solo adelanta el aviso, no lo duplica.

/** Tope por corrida: con 15 personas el universo real de opt-in es
 *  chico; el límite existe por el mismo motivo que `SWEEP_BATCH_SIZE`
 *  en push-dispatch.ts — que una corrida no se coma toda la ventana de
 *  CPU de una sola invocación si el opt-in crece. */
const DIGEST_BATCH_SIZE = 50

/** Cuántas tareas abiertas entran en el cuerpo del correo antes de
 *  truncar con un link a "Mis tareas" — un resumen de 80 líneas deja de
 *  ser un resumen. */
const MAX_TASKS_IN_BODY = 15

interface DigestTaskRow {
  id: string
  title: string
  due_date: string | null
  status: { status_kind: string } | null
  memberships: { container_id: string }[]
}

interface DigestTask {
  id: string
  title: string
  dueDate: string | null
  projectId: string | null
}

/** Entrypoint del cron por hora compartido — se llama siempre, filtra
 *  adentro (mismo criterio que `sweepDueReminders`, que también corre
 *  dentro del mismo disparo y decide por su cuenta qué tareas le tocan
 *  ahora). El filtro de día/hora local es en JS, no en SQL: son pocas
 *  personas con el resumen activado, y `Intl.DateTimeFormat` evita tener
 *  que traducir cada `timezone` de IANA a un offset a mano en Postgres. */
export async function sendWeeklyDigests(env: Env): Promise<void> {
  if (!env.EMAIL) return

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const client = adminClient(env)

  // `last_digest_sent_at.is.null,last_digest_sent_at.lt.${todayStr}`:
  // mismo criterio de idempotencia que documenta la columna (0058) — NULL
  // o una fecha vieja es "pendiente", hoy (UTC) es "ya se mandó". Sigue
  // sin hacer falta el patrón de "reclamo atómico" de sweepDueReminders
  // (0069): el filtro de día/hora local de abajo ya reduce el universo a,
  // como mucho, unas pocas personas por corrida.
  const { data: profiles, error: profilesError } = await client
    .from('profiles')
    .select('id, full_name, timezone, digest_day, digest_hour')
    .eq('weekly_digest_enabled', true)
    .or(`last_digest_sent_at.is.null,last_digest_sent_at.lt.${todayStr}`)
    .limit(DIGEST_BATCH_SIZE)
  if (profilesError) {
    console.error('sendWeeklyDigests: profiles query failed:', profilesError.message)
    return
  }
  if (!profiles || profiles.length === 0) return

  const due = (
    profiles as { id: string; full_name: string | null; timezone: string | null; digest_day: number; digest_hour: number }[]
  ).filter((profile) => {
    const { weekday, hour } = localWeekdayAndHour(now, profile.timezone ?? 'America/Santiago')
    return weekday === profile.digest_day && hour === profile.digest_hour
  })
  if (due.length === 0) return

  console.log(`weekly digest: ${due.length} destinatario(s)`)
  // En serie: mismo criterio que sweepPendingPushes (push-dispatch.ts) —
  // es la red de envío semanal, no un camino con apuro, y evita saturar
  // el rate limit de Email Sending con envíos en paralelo.
  for (const profile of due) {
    await sendDigestForUser(env, client, profile.id, profile.full_name, todayStr)
  }
}

async function sendDigestForUser(
  env: Env,
  client: ReturnType<typeof adminClient>,
  userId: string,
  fullName: string | null,
  todayStr: string,
): Promise<void> {
  // Mismo shape que myTasksQueryOptions (src/features/tasks/queries.ts):
  // `nodes` sin pasar por `node_memberships` como raíz porque el filtro
  // es por assignee_id, no por contenedor; `.is('parent_id', null)`
  // excluye subtareas por el mismo motivo (no tienen fila en
  // node_memberships, no habría a qué proyecto enlazarlas).
  const { data: rows, error: tasksError } = await client
    .from('nodes')
    .select(
      `
      id, title, due_date,
      status:statuses!nodes_status_id_fkey ( status_kind ),
      memberships:node_memberships!node_memberships_node_id_fkey ( container_id )
    `,
    )
    .eq('type', 'task')
    .eq('assignee_id', userId)
    .is('parent_id', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(200)

  if (tasksError) {
    console.error('sendWeeklyDigests: nodes query failed para', userId, tasksError.message)
    return
  }

  // 'success'/'dropped' = "ya no está activa" — mismo criterio que
  // isClosedStatus (src/features/projects/status-kind.ts), duplicado acá
  // a propósito por el mismo motivo que `describe()` en
  // notification-payload.ts: el Worker no comparte el árbol de `src/`, así
  // que se repite la constante, no la lógica de negocio real. Sin
  // 'dropped' acá, una tarea recién descartada volvía a aparecer en el
  // resumen semanal como si siguiera pendiente.
  const open = ((rows ?? []) as unknown as DigestTaskRow[])
    .filter((r) => r.status?.status_kind !== 'success' && r.status?.status_kind !== 'dropped')
    .map((r): DigestTask => ({
      id: r.id,
      title: r.title,
      dueDate: r.due_date,
      projectId: r.memberships[0]?.container_id ?? null,
    }))

  // Nadie a quien avisar de nada: no tiene sentido un correo vacío. Se
  // marca igual como enviado — mismo criterio que sweepDueReminders
  // marca una tarea sin responsables: el punto es no volver a evaluar a
  // esta persona hasta la semana próxima, no garantizar que se mandó un
  // correo con contenido.
  if (open.length === 0) {
    await client.from('profiles').update({ last_digest_sent_at: todayStr }).eq('id', userId)
    return
  }

  const { data: userRes, error: userError } = await client.auth.admin.getUserById(userId)
  const email = userRes?.user?.email
  if (userError || !email) {
    console.error('sendWeeklyDigests: sin email para', userId, userError?.message)
    return
  }

  const in7days = new Date()
  in7days.setUTCDate(in7days.getUTCDate() + 7)
  const in7daysStr = in7days.toISOString().slice(0, 10)

  const dueSoon = open.filter((t) => t.dueDate !== null && t.dueDate <= in7daysStr)
  const rest = open.filter((t) => !dueSoon.includes(t))
  const ordered = [...dueSoon, ...rest].slice(0, MAX_TASKS_IN_BODY)
  const overflow = open.length - ordered.length

  const greeting = fullName ? (fullName.split(' ')[0] ?? fullName) : 'Hola'
  const subject =
    dueSoon.length > 0
      ? `Tu semana en Flow: ${dueSoon.length} tarea${dueSoon.length === 1 ? '' : 's'} vencen pronto`
      : `Tu semana en Flow: ${open.length} tarea${open.length === 1 ? '' : 's'} abierta${open.length === 1 ? '' : 's'}`

  const taskUrl = (t: DigestTask) => `${APP_ORIGIN}${t.projectId ? `/p/${t.projectId}/t/${t.id}` : '/mis-tareas'}`
  const dueLabel = (t: DigestTask) => (t.dueDate ? `vence ${t.dueDate}` : 'sin fecha')

  // Chip de urgencia por color (artifact "Correos de Flow", 2026-09-11):
  // vencida = roja, dentro de los próximos 7 días = ámbar, el resto
  // (incluido "sin fecha") = gris. `todayStr`/`in7daysStr` son las mismas
  // fechas ISO que ya se usan para separar `dueSoon` de `rest` arriba.
  const chip = (t: DigestTask): { label: string; bg: string; fg: string } => {
    if (!t.dueDate) return { label: 'sin fecha', bg: '#F1F5F9', fg: '#64748B' }
    if (t.dueDate < todayStr) return { label: 'venció', bg: '#FFE4E6', fg: '#BE123C' }
    if (t.dueDate <= in7daysStr) return { label: t.dueDate, bg: '#FEF3C7', fg: '#92400E' }
    return { label: t.dueDate, bg: '#F1F5F9', fg: '#64748B' }
  }

  const textLines = [
    `Hola ${greeting},`,
    '',
    dueSoon.length > 0
      ? `Tienes ${dueSoon.length} tarea${dueSoon.length === 1 ? '' : 's'} que vence${dueSoon.length === 1 ? '' : 'n'} esta semana:`
      : `No tienes tareas por vencer esta semana. Tareas abiertas asignadas:`,
    ...ordered.map((t) => `- ${t.title} (${dueLabel(t)}) — ${taskUrl(t)}`),
    overflow > 0 ? `...y ${overflow} más. Ver todas en ${APP_ORIGIN}/mis-tareas` : '',
    '',
    `Ver "Mis tareas" completo: ${APP_ORIGIN}/mis-tareas`,
  ].filter(Boolean)

  const htmlItems = ordered
    .map((t) => {
      const c = chip(t)
      return `<li style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 11px;border:1px solid #E2E8F0;border-radius:8px;font-size:12.5px;list-style:none;margin:0 0 7px;">
        <a href="${taskUrl(t)}" style="font-weight:700;color:#0F172A;text-decoration:none;">${escapeHtml(t.title)}</a>
        <span style="font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;background:${c.bg};color:${c.fg};white-space:nowrap;">${c.label}</span>
      </li>`
    })
    .join('')
  const content = `
    <p style="font-size:14px;line-height:1.55;color:#0F172A;margin:0 0 13px;">Hola ${escapeHtml(greeting)}, ${
      dueSoon.length > 0
        ? `tienes ${dueSoon.length} tarea${dueSoon.length === 1 ? '' : 's'} que vence${dueSoon.length === 1 ? '' : 'n'} esta semana:`
        : 'no tienes tareas por vencer esta semana. Tareas abiertas asignadas:'
    }</p>
    <ul style="margin:0 0 16px;padding:0;">${htmlItems}</ul>
    ${overflow > 0 ? `<p style="font-size:12.5px;color:#64748B;margin:0 0 16px;">...y ${overflow} más. <a href="${APP_ORIGIN}/mis-tareas" style="color:#D6004C;">Ver todas</a>.</p>` : ''}
    ${renderEmailButton('Ver "Mis tareas"', `${APP_ORIGIN}/mis-tareas`, '#F59E0B')}
  `
  const htmlBody = renderEmailShell(content, 'Desactivar el resumen semanal')

  const sent = await sendBrandedEmail(env, email, subject, textLines.join('\n'), htmlBody, 'sendWeeklyDigests')
  if (!sent) return

  await client.from('profiles').update({ last_digest_sent_at: todayStr }).eq('id', userId)
}
