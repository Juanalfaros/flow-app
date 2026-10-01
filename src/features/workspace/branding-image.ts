import type { BrandingKind } from '@/features/workspace/api'

// Tope real está en el bucket `branding` (0078_branding_upload_limits.sql,
// 5 MB) — este valor es el mismo, para poder avisar ANTES de intentar
// subir en vez de esperar el rechazo del storage.
const MAX_BRANDING_BYTES = 5 * 1024 * 1024

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif'])
const HEIC_EXTENSION = /\.(heic|heif)$/i

/**
 * El MIME de HEIC es inconsistente entre navegador y SO — Safari en iOS lo
 * reporta como 'image/heic', pero según versión también se ha visto vacío
 * o genérico. Por eso se mira también la extensión del archivo, no solo
 * `file.type` — y de todos modos `createImageBitmap` (más abajo) es la
 * verificación real: un HEIC que se cuele hasta ahí falla igual porque
 * ningún navegador de escritorio sabe decodificarlo.
 */
function looksLikeHeic(file: File): boolean {
  return HEIC_MIME_TYPES.has(file.type) || HEIC_EXTENSION.test(file.name)
}

interface BrandingProcessSpec {
  /** Lado mayor tope, en px — el logo se ve a lo sumo a 40px de alto en
   *  pantalla (SplitScreenLayout), pero se deja margen para retina y para
   *  que sirva reutilizado en otro tamaño el día de mañana. El fondo cubre
   *  medio viewport de escritorio, de ahí el margen mayor. */
  maxDimension: number
  mimeType: 'image/png' | 'image/jpeg'
  quality?: number
  extension: string
}

// Logo -> PNG: preserva transparencia (la mayoría de los logos la tienen).
// Fondo -> JPEG: es una foto, no necesita alfa, y pesa bastante menos.
const BRANDING_PROCESS_SPEC: Record<BrandingKind, BrandingProcessSpec> = {
  logo: { maxDimension: 480, mimeType: 'image/png', extension: 'png' },
  login_background: { maxDimension: 1920, mimeType: 'image/jpeg', quality: 0.85, extension: 'jpg' },
}

/**
 * Procesa la imagen ANTES de subirla: recomprime a través de un canvas con
 * un tope de dimensión por tipo, y de paso normaliza cualquier formato que
 * el navegador sepa decodificar a uno solo consistente (PNG o JPEG según
 * el tipo de campo). Rechaza HEIC explícitamente antes de intentarlo —
 * ningún navegador de escritorio lo decodifica, así que dejarlo pasar
 * habría producido un archivo "subido" pero invisible.
 *
 * Sutil a propósito: sin diálogo de recorte ni ajustes, una sola pasada.
 * Sirve tanto para bajar el peso de una foto de teléfono a resolución
 * completa como para dar un mensaje de error claro en los pocos casos que
 * no se puede procesar, en vez de que el storage rebote con un 400 críptico.
 */
export async function processBrandingImage(file: File, kind: BrandingKind): Promise<File> {
  if (looksLikeHeic(file)) {
    throw new Error(
      'Las fotos HEIC (típicas de iPhone) no se pueden usar directo. Expórtala como JPG o PNG e inténtalo de nuevo.',
    )
  }

  const spec = BRANDING_PROCESS_SPEC[kind]

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('No se pudo leer esta imagen. Prueba con un JPG, PNG o WebP.')
  }

  // Nunca agranda: `Math.min(1, …)` dispara el escalado solo cuando el
  // lado mayor supera el tope.
  const scale = Math.min(1, spec.maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('No se pudo procesar esta imagen en este navegador.')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, spec.mimeType, spec.quality))
  if (!blob) throw new Error('No se pudo procesar esta imagen. Prueba con otro archivo.')

  if (blob.size > MAX_BRANDING_BYTES) {
    throw new Error(
      `La imagen sigue pesando más de ${Math.round(MAX_BRANDING_BYTES / (1024 * 1024))} MB incluso comprimida. Prueba con una imagen más simple.`,
    )
  }

  return new File([blob], `${kind}.${spec.extension}`, { type: spec.mimeType })
}
