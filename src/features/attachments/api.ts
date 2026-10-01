import { supabase } from '@/lib/supabase'
import { authorizedFetch, readJsonBody } from '@/lib/api-fetch'

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

/**
 * Sube un archivo a R2 vía el Worker (que valida acceso al nodo y mueve los
 * bytes — ver worker/attachments.ts) y después inserta la fila de metadata
 * directo contra Supabase, protegida por su propia RLS (0038). Dos pasos, no
 * uno: el Worker no tiene por qué saber de `task_attachments`, y así la
 * policy de INSERT sigue siendo la única fuente de verdad de quién puede
 * adjuntar qué — mismo criterio que separa `/api/invite` (solo lo que
 * necesita `service_role`) del resto, que va directo a PostgREST.
 */
export async function uploadAttachment(nodeId: string, file: File, uploadedBy: string) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`El archivo debe pesar menos de ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`)
  }

  const params = new URLSearchParams({ node_id: nodeId, filename: file.name })
  const res = await authorizedFetch(`/api/attachments?${params}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': String(file.size),
    },
    body: file,
  })
  const body = await readJsonBody<{ error?: string; storage_key?: string; size_bytes?: number }>(
    res,
    '/api/attachments',
  )
  if (!res.ok || !body.storage_key) throw new Error(body.error ?? 'No se pudo subir el archivo')

  const { data, error } = await supabase
    .from('task_attachments')
    .insert({
      node_id: nodeId,
      storage_key: body.storage_key,
      filename: file.name,
      content_type: file.type || null,
      size_bytes: body.size_bytes ?? file.size,
      uploaded_by: uploadedBy,
    })
    .select('id, node_id, storage_key, filename, content_type, size_bytes, uploaded_by, created_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Borra primero en R2 (el Worker confirma dueño mientras la fila todavía
 * existe) y recién después la fila en Supabase — en ese orden nunca queda
 * una fila apuntando a un archivo que ya no está. Ver la nota de orden en
 * worker/attachments.ts.
 */
export async function deleteAttachment(storageKey: string) {
  const params = new URLSearchParams({ key: storageKey })
  const res = await authorizedFetch(`/api/attachments?${params}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await readJsonBody<{ error?: string }>(res, '/api/attachments')
    throw new Error(body.error ?? 'No se pudo eliminar el archivo')
  }

  const { error } = await supabase.from('task_attachments').delete().eq('storage_key', storageKey)
  if (error) throw error
}

/**
 * El endpoint de descarga exige el JWT en `Authorization` (mismo criterio de
 * autorización que subir y borrar — ver worker/attachments.ts), así que un
 * `<a href>` plano no sirve: el navegador no le agrega el header a una
 * navegación normal. Se trae como blob con `fetch` (que sí lleva el header) y
 * se dispara la descarga/apertura desde ahí. La URL de objeto se revoca tras
 * un instante — alcanza para que el navegador la tome, no hace falta
 * mantenerla viva.
 */
/**
 * Igual que `openAttachment` (mismo endpoint, mismo header de auth — el
 * bucket es privado, no hay URL pública/firmada que pedirle a R2 directo),
 * pero devuelve la Object URL en vez de disparar una descarga. Usado para
 * la miniatura de imágenes: sin infraestructura de resize server-side, la
 * "miniatura" es la imagen real escalada por CSS, no un thumbnail generado.
 */
export async function fetchAttachmentObjectUrl(storageKey: string): Promise<string> {
  const params = new URLSearchParams({ key: storageKey })
  const res = await authorizedFetch(`/api/attachments?${params}`)
  if (!res.ok) throw new Error('No se pudo cargar la miniatura')

  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function openAttachment(storageKey: string, filename: string) {
  const params = new URLSearchParams({ key: storageKey })
  const res = await authorizedFetch(`/api/attachments?${params}`)
  if (!res.ok) throw new Error('No se pudo abrir el archivo')

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}
