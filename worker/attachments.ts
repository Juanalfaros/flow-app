import { createClient } from '@supabase/supabase-js'
import type { Env } from './index'

// 20 MB por archivo: generoso para lo que un equipo de 15 personas adjunta a
// una tarea (capturas, PDFs cortos), lejos de comprometer los 10 GB gratis
// de R2 incluso con uso descuidado. Sin cuota total todavía — ver
// 0038_task_attachments.sql para el motivo de dejarla afuera de v1.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

// La key va siempre por query param (`?key=`), nunca como segmento de path:
// contiene un `/` (`{node_id}/{uuid}-{filename}`) que un router por path
// tendría que des-escapar a mano sin ganar nada a cambio.

function sanitizeFilename(name: string): string {
  // Sin separadores de path ni caracteres que rompan la key de R2 o un
  // futuro header Content-Disposition. `slice(-100)`: un nombre muy largo
  // no debería inflar la key completa (node_id + uuid + filename).
  return name.replace(/[/\\]/g, '_').replace(/[^\w.-]/g, '_').slice(-100)
}

// Auditoría de seguridad 2026-09-16, S5: `content_type` lo escribe el
// cliente sin validación (src/features/attachments/api.ts,
// `content_type: file.type`) y la columna no tiene CHECK — sin esto,
// alguien podía guardar `text/html` (o `image/svg+xml`, que también
// ejecuta script pese al prefijo "image/") y hacer que este endpoint
// sirva HTML arbitrario con `Content-Disposition: inline` desde el
// origen de la app. Hoy no es explotable (el endpoint exige
// Authorization, así que no se puede abrir por navegación directa) pero
// es una propiedad frágil — alcanza con que alguien agregue un visor de
// PDF, un `<iframe>` o un "abrir en pestaña nueva" para volverlo XSS de
// origen completo.
//
// Allowlist por FAMILIA, no una lista fija de subtipos: AttachmentList.tsx
// (`AttachmentThumbnail`) renderiza un `<img>` real para cualquier
// `image/*` que suba alguien (bmp/heic/tiff/avif incluidos, no solo png/
// jpeg/gif/webp) — una lista fija habría degradado esos formatos a
// `application/octet-stream` y roto la miniatura para cualquier imagen
// fuera de esa lista. El único subtipo de imagen genuinamente peligroso
// es `image/svg+xml` (puede traer `<script>` embebido pese al MIME),
// así que se excluye a mano.
function isSafeInlineContentType(contentType: string): boolean {
  if (contentType === 'image/svg+xml') return false
  if (contentType.startsWith('image/')) return true
  return contentType === 'application/pdf' || contentType === 'text/plain'
}

function normalizeContentType(contentType: string | null): string {
  return contentType && isSafeInlineContentType(contentType) ? contentType : 'application/octet-stream'
}

export async function handleAttachmentUpload(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const url = new URL(request.url)
  const nodeId = url.searchParams.get('node_id')
  const filename = url.searchParams.get('filename')
  if (!nodeId || !filename) {
    return Response.json({ error: 'Falta node_id o filename' }, { status: 400 })
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? '0')
  if (!contentLength || contentLength > MAX_ATTACHMENT_BYTES) {
    return Response.json(
      { error: `El archivo debe pesar menos de ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    )
  }

  // Mismo patrón que /api/invite: el cliente lleva el token de quien llama,
  // la RPC decide autorización server-side — el Worker no reimplementa esa
  // lógica. `can_access_node` (0035) es la fuente de verdad.
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: allowed, error: authError } = await userClient.rpc('can_access_node', { p_node_id: nodeId })
  if (authError || !allowed) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  const key = `${nodeId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`
  const object = await env.ATTACHMENTS.put(key, request.body, {
    httpMetadata: { contentType: request.headers.get('Content-Type') ?? 'application/octet-stream' },
  })

  // `contentLength` (arriba) es solo lo que el cliente DECLARÓ — nada
  // impide que el cuerpo real sea más grande (un `Content-Length`
  // mentiroso más chico que el body de verdad no lo detecta el chequeo
  // de arriba, y R2 escribe igual todos los bytes que llegaron). El
  // tamaño real es el que reporta `R2Bucket.put()` después de escribir;
  // si de todos modos se pasó del límite, se borra el objeto recién
  // escrito en vez de dejarlo persistir con una cuota mentida
  // (auditoría de seguridad 2026-09-16, B1).
  if (object.size > MAX_ATTACHMENT_BYTES) {
    await env.ATTACHMENTS.delete(key)
    return Response.json(
      { error: `El archivo debe pesar menos de ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    )
  }

  // La fila de `task_attachments` la inserta el cliente directo contra
  // Supabase (RLS propia, mismo `uploaded_by = auth.uid()` que ya exige la
  // policy) — este endpoint solo mueve bytes a R2 y devuelve la key. Si el
  // insert de metadata falla después de esto, el objeto queda huérfano en
  // R2: aceptado para v1, es cuota de storage propia, no una fuga de datos.
  return Response.json({ storage_key: key, size_bytes: object.size })
}

export async function handleAttachmentDownload(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return Response.json({ error: 'Falta key' }, { status: 400 })
  }

  // La policy SELECT de `task_attachments` (can_access_node) decide si esta
  // key es visible para quien pregunta — no se confía en el prefijo de la
  // propia key, que el cliente podría manipular.
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: attachment } = await userClient
    .from('task_attachments')
    .select('id, filename, content_type')
    .eq('storage_key', key)
    .maybeSingle()
  if (!attachment) {
    return Response.json({ error: 'No encontrado' }, { status: 404 })
  }

  const object = await env.ATTACHMENTS.get(key)
  if (!object) {
    return Response.json({ error: 'No encontrado' }, { status: 404 })
  }

  const safeContentType = normalizeContentType(attachment.content_type)
  const disposition = isSafeInlineContentType(safeContentType) ? 'inline' : 'attachment'

  return new Response(object.body, {
    headers: {
      'Content-Type': safeContentType,
      'Content-Disposition': `${disposition}; filename="${sanitizeFilename(attachment.filename)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

export async function handleAttachmentDelete(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return Response.json({ error: 'Falta key' }, { status: 400 })
  }

  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()
  if (userError || !user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Dueño se comprueba ACÁ, mientras la fila todavía existe: el cliente
  // borra la fila de Supabase recién después de que este paso confirme el
  // borrado físico en R2 (ver src/features/attachments/mutations.ts). En ese
  // orden, si este paso rechaza, no queda ni una fila sin archivo ni un
  // archivo sin fila — el peor caso es un archivo sin fila (si el delete de
  // la fila fallara después), mismo tipo de huérfano aceptado que en la
  // subida.
  const { data: attachment } = await userClient
    .from('task_attachments')
    .select('uploaded_by')
    .eq('storage_key', key)
    .maybeSingle()
  if (!attachment) {
    return Response.json({ error: 'No encontrado' }, { status: 404 })
  }
  if (attachment.uploaded_by !== user.id) {
    return Response.json({ error: 'Solo quien lo subió puede eliminarlo' }, { status: 403 })
  }

  await env.ATTACHMENTS.delete(key)
  return Response.json({ ok: true })
}
