import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, Download01Icon, AlertCircleIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { parseCsv } from '@/lib/csv'
import { useStatuses } from '@/features/projects/queries'
import { useWorkspaceMembers } from '@/features/workspace/queries'
import { useLabels } from '@/features/labels/queries'
import {
  IMPORT_CSV_HEADER,
  importTasksToProject,
  resolveImportRows,
  type ImportRowResolution,
} from '@/features/tasks/csv-import'
import { cn } from '@/lib/utils'

interface ImportTasksDialogProps {
  projectId: string
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Espejo inverso de la exportación (F5 #4, csv-export.ts) — mismo formato
// de columnas, para poder exportar una lista, editarla en una planilla, y
// reimportarla. La resolución (estado/asignado/etiqueta por nombre)
// corre client-side ANTES de confirmar, así el preview muestra qué se va
// a aplicar tal cual y qué no matcheó — nada se manda a ciegas a la RPC.
export function ImportTasksDialog({ projectId, workspaceId, open, onOpenChange }: ImportTasksDialogProps) {
  const [rows, setRows] = useState<ImportRowResolution[] | null>(null)
  const [fileName, setFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: statuses } = useStatuses(projectId)
  const { data: members } = useWorkspaceMembers(workspaceId)
  const { data: labels } = useLabels(workspaceId)

  const memberOptions = useMemo(
    () => (members ?? []).map((m) => ({ user_id: m.user_id, full_name: m.profile?.full_name ?? null })),
    [members],
  )

  const importMutation = useMutation({
    mutationFn: (toImport: ImportRowResolution[]) => importTasksToProject(projectId, toImport),
    onSuccess: (ids) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
      toast.success(`${ids.length} tarea${ids.length === 1 ? '' : 's'} importada${ids.length === 1 ? '' : 's'}.`)
      handleClose()
    },
    onError: () => toast.error('No se pudo importar el archivo.'),
  })

  function handleClose() {
    setRows(null)
    setFileName('')
    onOpenChange(false)
  }

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ''))
      // La primera fila puede ser el encabezado (si el archivo viene de
      // "Exportar a CSV" de esta misma app, siempre lo es) — se descarta
      // comparando el título de columna, no la posición, por si alguien
      // reordenó columnas a mano y la primera ya no es "Título".
      const first = parsed[0]
      const withoutHeader = first && first[0]?.trim().toLowerCase() === IMPORT_CSV_HEADER[0]?.toLowerCase() ? parsed.slice(1) : parsed
      setRows(resolveImportRows(withoutHeader, statuses ?? [], memberOptions, labels ?? []))
    }
    reader.readAsText(file)
  }

  const unresolvedCount = rows?.filter((r) => !r.title).length ?? 0
  const importableRows = rows?.filter((r) => !!r.title) ?? []

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : handleClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar tareas desde CSV</DialogTitle>
        </DialogHeader>

        {!rows ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">
              Mismo formato que "Exportar a CSV": Título, Estado, Prioridad, Asignados, Etiquetas, Fecha de
              inicio, Fecha límite, Hito. Estado/asignado/etiqueta se buscan por nombre exacto — lo que no
              matchea queda sin asignar (o va al estado por defecto), nunca se crea de más.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) handleFile(file)
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <HugeiconsIcon icon={Download01Icon} />
              Elegir archivo CSV
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">
              {fileName} — {importableRows.length} fila{importableRows.length === 1 ? '' : 's'} para importar
              {unresolvedCount > 0 ? `, ${unresolvedCount} sin título (se omiten)` : ''}.
            </p>
            <div className="max-h-80 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface-alt">
                  <tr>
                    <th className="p-2 font-medium">Título</th>
                    <th className="p-2 font-medium">Estado</th>
                    <th className="p-2 font-medium">Asignado</th>
                    <th className="p-2 font-medium">Etiquetas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={cn('border-t border-border', !r.title && 'opacity-40')}>
                      <td className="p-2">{r.title || <span className="italic">(sin título, se omite)</span>}</td>
                      <td className="p-2">
                        {r.statusName ? (
                          <span className="flex items-center gap-1">
                            <HugeiconsIcon
                              icon={r.statusId ? CheckmarkCircle02Icon : AlertCircleIcon}
                              className={cn('size-3.5', r.statusId ? 'text-success-text' : 'text-warn-text')}
                            />
                            {r.statusName}
                            {!r.statusId && <span className="text-text-muted">→ estado por defecto</span>}
                          </span>
                        ) : (
                          <span className="text-text-muted">estado por defecto</span>
                        )}
                      </td>
                      <td className="p-2">
                        {r.assigneeName ? (
                          <span className="flex items-center gap-1">
                            <HugeiconsIcon
                              icon={r.assigneeId ? CheckmarkCircle02Icon : AlertCircleIcon}
                              className={cn('size-3.5', r.assigneeId ? 'text-success-text' : 'text-warn-text')}
                            />
                            {r.assigneeName}
                            {!r.assigneeId && <span className="text-text-muted">→ sin asignar</span>}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="p-2">
                        {r.labelNames.length === 0 ? (
                          <span className="text-text-muted">—</span>
                        ) : (
                          <span>
                            {r.labelIds.length} de {r.labelNames.length}
                            {r.unmatchedLabels.length > 0 && (
                              <span className="text-warn-text"> ({r.unmatchedLabels.join(', ')} no encontrada{r.unmatchedLabels.length === 1 ? '' : 's'})</span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          {rows && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRows(null)}>
              Elegir otro archivo
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!rows || importableRows.length === 0 || importMutation.isPending}
            onClick={() => rows && importMutation.mutate(importableRows)}
          >
            {importMutation.isPending ? 'Importando…' : `Importar ${importableRows.length || ''} tarea${importableRows.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
