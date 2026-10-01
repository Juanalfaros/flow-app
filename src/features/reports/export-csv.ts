import type { PortfolioEntry, ReportSpace } from '@/features/reports/report-data'

// "Exportar CSV" del mockup — exporta el portafolio (espacio/lista, avance,
// vencidas, a tiempo, horas): es la única tabla del reporte que tiene
// sentido llevarse entera a una hoja de cálculo, el resto (KPIs,
// atención, hitos) son listas cortas que se leen mejor en pantalla.
function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadPortfolioCsv(portfolio: PortfolioEntry[], spaces: ReportSpace[]) {
  const spaceTitle = new Map(spaces.map((s) => [s.id, s.title]))
  const header = ['Espacio', 'Lista', 'Abiertas', 'Vencidas', 'A tiempo (%)', 'Horas', 'Próximo hito', 'Vence']
  const rows = portfolio.map((p) => [
    spaceTitle.get(p.spaceId) ?? '',
    p.title,
    p.openCount,
    p.overdueCount,
    p.ontimePct ?? '',
    p.hours,
    p.nextMilestone?.title ?? '',
    p.nextMilestone?.dueDate ?? '',
  ])

  // BOM al inicio: sin él, Excel en Windows (el uso más probable acá)
  // interpreta el UTF-8 como Latin-1 y rompe los acentos.
  const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `reportes-portafolio-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
