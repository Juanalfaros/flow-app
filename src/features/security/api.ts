import { supabase } from '@/lib/supabase'
import { authorizedFetch, readJsonBody } from '@/lib/api-fetch'

// Sin tabla propia: 2FA y sesiones viven bajo el schema `auth` de
// Supabase (auth.mfa_factors, auth.sessions) — este archivo solo envuelve
// `supabase.auth.mfa.*` y `supabase.auth.signOut`, API cliente real
// confirmada contra @supabase/auth-js 2.110.8 (ver types.d.ts: enroll,
// challengeAndVerify, unenroll, listFactors, y el scope 'others' de
// signOut). Reemplaza la lista mockeada de "sesiones activas" de
// SecuritySection (device/ubicación no son datos que esta API exponga).

export async function listMfaFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data
}

// `challengeAndVerify` resuelve challenge+verify en un solo paso — no hace
// falta un `challenge()` intermedio para TOTP.
export async function enrollTotpFactor() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) throw error
  return data
}

export async function verifyTotpFactor(factorId: string, code: string) {
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  if (error) throw error
  return data
}

export async function unenrollFactor(factorId: string) {
  const { data, error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
  return data
}

// `scope: 'others'` invalida todas las sesiones de esta cuenta EXCEPTO la
// actual — no requiere saber cuáles son ni dónde están, así que reemplaza
// por completo la necesidad de "listar" sesiones para poder cerrarlas.
export async function signOutOtherSessions() {
  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) throw error
}

// El borrado real vive en el Worker (Service Role, worker/account.ts) —
// nunca con la clave anónima, `auth.admin.deleteUser` no está expuesto al
// cliente. Sin body: el Worker borra a quien resuelve el JWT reenviado,
// nunca un id ajeno.
export async function deleteOwnAccount() {
  const res = await authorizedFetch('/api/account', { method: 'DELETE' })
  if (!res.ok) {
    // Antes: `res.json().catch(() => null)`, que se tragaba el motivo real
    // (ej. 404 de `pnpm dev` sin Worker) detrás de un mensaje genérico
    // (auditoría de optimización 2026-09-16, D1).
    const body = await readJsonBody<{ error?: string }>(res, '/api/account')
    throw new Error(body.error ?? 'No se pudo eliminar la cuenta')
  }
}

export type AccountExportType = 'tasks' | 'comments' | 'time'

// Descarga directa (sin cola ni aviso por Bandeja): a esta escala — una
// persona, sus propias filas — el Worker arma el CSV dentro del mismo
// request. Dispara la descarga con el patrón estándar de blob + <a>
// temporal, porque un <a href> directo no podría llevar el header
// Authorization que exige el Worker (ver authorizedFetch).
export async function downloadAccountExport(type: AccountExportType) {
  const res = await authorizedFetch(`/api/account/export?type=${type}`)
  if (!res.ok) {
    const body = await readJsonBody<{ error?: string }>(res, '/api/account/export')
    throw new Error(body.error ?? 'No se pudo generar la descarga')
  }
  const blob = await res.blob()
  const filename = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `flow-${type}.csv`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
