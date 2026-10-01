import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

// Puente entre el Service Worker (que intercepta el POST del Share Target
// del sistema operativo — ver src/sw.ts) y la ruta /compartir (que lo lee).
// No hay otro canal disponible: el navegador entrega el payload compartido
// como multipart/form-data a la URL de `action` del manifest, y eso solo lo
// puede leer el fetch handler del SW — la app en sí nunca ve esa request.
// IndexedDB es la única forma de pasarle esos bytes (incluidos los
// archivos, que sí sobreviven el structured clone como `File` real) a la
// pestaña que el SW abre después con el redirect.
//
// Base de datos propia y no un store nuevo en la de offline-queue.ts: son
// dos ciclos de vida distintos (esto vive minutos, hasta que /compartir lo
// consume; lo otro persiste hasta reconectar) y abrirla desde el SW no
// debería arrastrar ningún supuesto de esa otra.

export interface SharedPayload {
  id: 'pending'
  title: string
  text: string
  url: string
  files: File[]
  created_at: number
}

interface ShareTargetDB extends DBSchema {
  shared: { key: string; value: SharedPayload }
}

let dbPromise: Promise<IDBPDatabase<ShareTargetDB>> | null = null

function getShareTargetDb() {
  if (!dbPromise) {
    dbPromise = openDB<ShareTargetDB>('flow-share-target', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('shared')) {
          db.createObjectStore('shared', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

/** Llamado desde src/sw.ts al recibir el POST del Share Target. */
export async function storePendingShare(payload: Omit<SharedPayload, 'id'>) {
  const db = await getShareTargetDb()
  await db.put('shared', { ...payload, id: 'pending' })
}

/**
 * Llamado desde /compartir al montar. "Take" y no "get": una vez leído se
 * borra — recargar esa pestaña no debe volver a ofrecer la misma tarea ya
 * creada (o descartada) como si fuera nueva.
 */
export async function takePendingShare(): Promise<SharedPayload | null> {
  const db = await getShareTargetDb()
  const record = (await db.get('shared', 'pending')) ?? null
  if (record) await db.delete('shared', 'pending')
  return record
}
