import { supabase } from '@/lib/supabase'

// Antes reimplementado 4 veces (people/google-calendar.ts, workspace/api.ts,
// attachments/api.ts —4 funciones dentro del mismo archivo—, security/api.ts)
// con comportamiento que ya había divergido: security/api.ts usaba
// `res.json().catch(() => null)`, perdiendo el mensaje útil del 404 en
// desarrollo que el resto sí tenía (auditoría de optimización 2026-09-16,
// D1). Un solo lugar para las dos partes de este patrón.

/**
 * `fetch` con el JWT de la sesión actual en `Authorization` — todo endpoint
 * propio del Worker (a diferencia de PostgREST, que usa su propio cliente y
 * su propia sesión) exige este header a mano.
 */
export async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa')

  return fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  })
}

/**
 * Lee el cuerpo de una respuesta del Worker tolerando que no sea JSON
 * válido. `pnpm dev` levanta solo Vite, que no conoce las rutas /api/* (viven
 * en el Worker) y contesta 404 con cuerpo vacío — un `res.json()` directo
 * rompe con "Unexpected end of JSON input" y esconde la causa real; se lee
 * como texto y se parsea a mano para poder distinguir ese caso del resto.
 */
export async function readJsonBody<T>(res: Response, endpoint: string): Promise<T> {
  const raw = await res.text()
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T)
  } catch {
    throw new Error(
      res.status === 404
        ? `El endpoint ${endpoint} no está disponible en este entorno. Prueba con \`wrangler dev\` o en el sitio desplegado.`
        : `El servidor respondió ${res.status} sin JSON válido.`,
    )
  }
}
