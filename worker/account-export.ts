import { createClient } from '@supabase/supabase-js'
import type { Env } from './index'

// Descargar mis datos (rediseño de Ajustes PR 6, Zona de peligro) — tres
// CSV, uno por tabla, no un .zip: agregar una librería de compresión solo
// para empaquetar 3 archivos chicos no se justificaba, y tres descargas con
// nombre propio son igual de claras que un .zip con tres adentro.
//
// Mismo esqueleto de auth que handleDeleteAccount (account.ts): el JWT
// reenviado identifica a quién pertenecen los datos. A diferencia de ese
// handler, acá NO hace falta el cliente de Service Role — cada tabla ya
// tiene RLS que permite leer las propias filas (comments_select,
// time_entries_select, y la del propio nodo vía assignee_id), así que el
// cliente scopeado al JWT del usuario alcanza y de paso no puede filtrar
// datos de nadie más aunque hubiera un bug acá.

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

export async function handleAccountExport(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Missing Authorization header' }, { status: 401 })

  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) {
    return Response.json({ error: 'Sesión inválida' }, { status: 401 })
  }
  const userId = authData.user.id

  const type = new URL(request.url).searchParams.get('type')

  if (type === 'tasks') {
    const { data, error } = await userClient
      .from('nodes')
      .select('id, title, priority, due_date, completed_at, created_at, status:statuses!nodes_status_id_fkey(name)')
      .eq('type', 'task')
      .eq('assignee_id', userId)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []) as unknown as {
      id: string
      title: string
      priority: string
      due_date: string | null
      completed_at: string | null
      created_at: string
      status: { name: string } | null
    }[]
    const csv = toCsv(
      ['id', 'titulo', 'estado', 'prioridad', 'vencimiento', 'completada_el', 'creada_el'],
      rows.map((r) => [r.id, r.title, r.status?.name ?? '', r.priority, r.due_date, r.completed_at, r.created_at]),
    )
    return csvResponse(csv, 'flow-tareas.csv')
  }

  if (type === 'comments') {
    const { data, error } = await userClient
      .from('comments')
      .select('id, node_id, body, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []) as { id: string; node_id: string; body: string; created_at: string }[]
    const csv = toCsv(
      ['id', 'tarea_id', 'comentario', 'creado_el'],
      rows.map((r) => [r.id, r.node_id, r.body, r.created_at]),
    )
    return csvResponse(csv, 'flow-comentarios.csv')
  }

  if (type === 'time') {
    const { data, error } = await userClient
      .from('time_entries')
      .select('id, node_id, minutes, entry_date, note, created_at')
      .eq('user_id', userId)
      .order('entry_date', { ascending: false })
      .limit(5000)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const rows = (data ?? []) as {
      id: string
      node_id: string
      minutes: number
      entry_date: string
      note: string | null
      created_at: string
    }[]
    const csv = toCsv(
      ['id', 'tarea_id', 'minutos', 'fecha', 'nota', 'creado_el'],
      rows.map((r) => [r.id, r.node_id, r.minutes, r.entry_date, r.note, r.created_at]),
    )
    return csvResponse(csv, 'flow-horas.csv')
  }

  return Response.json({ error: "type debe ser 'tasks', 'comments' o 'time'" }, { status: 400 })
}
