export const operatingTimeZone = 'America/Mexico_City'
export function formatRecordedAt(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: operatingTimeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}
export function formatPresence(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '—'
  const total = Math.max(0, Math.floor(Number(seconds)))
  return `${Math.floor(total / 3600)} h ${String(Math.floor((total % 3600) / 60)).padStart(2, '0')} min`
}
export const formatPercent = (value) =>
  value == null
    ? 'Sin base'
    : `${Number(value).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`
export function reportPreset(kind, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: operatingTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  )
  const endDate = `${parts.year}-${parts.month}-${parts.day}`,
    d = new Date(endDate + 'T12:00:00Z')
  if (kind === 'weekly')
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  else if (kind === 'fortnightly') d.setUTCDate(d.getUTCDate() <= 15 ? 1 : 16)
  else if (kind === 'previousMonth') {
    d.setUTCDate(0)
    const end = d.toISOString().slice(0, 10)
    d.setUTCDate(1)
    return { startDate: d.toISOString().slice(0, 10), endDate: end }
  } else d.setUTCDate(1)
  return { startDate: d.toISOString().slice(0, 10), endDate }
}
export function downloadReportFile(
  content,
  filename,
  type = 'text/csv;charset=utf-8'
) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function exportReportPdf(report, filters) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ orientation: 'landscape' }),
    s = report.summary
  doc.setFillColor(22, 38, 62)
  doc.rect(0, 0, 297, 28, 'F')
  doc.setTextColor(255)
  doc.setFontSize(19)
  doc.text('Farmacias | Reporte de ejecución', 12, 15)
  doc.setFontSize(10)
  doc.text(
    `${report.period.startDate} a ${report.period.endDate} | Hora Guadalajara`,
    12,
    23
  )
  doc.setTextColor(30, 45, 65)
  doc.setFontSize(10)
  const scope =
    [
      filters.personId &&
        `Persona: ${report.people.find((p) => p.id === filters.personId)?.name || 'Personal seleccionado'}`,
      filters.coordinatorName && `Coordinación: ${filters.coordinatorName}`,
      filters.project && `Proyecto: ${filters.project}`,
      filters.jurisdiction && `Jurisdicción: ${filters.jurisdiction}`,
      filters.state && `Entidad: ${filters.state}`,
    ]
      .filter(Boolean)
      .join(' | ') || 'Estructura y filtros autorizados'
  const scopeLines = doc.splitTextToSize(scope, 270)
  doc.text(scopeLines, 12, 36)
  autoTable(doc, {
    startY: 40 + scopeLines.length * 4,
    head: [
      [
        'Visitas finalizadas',
        'Cobertura propia',
        'Cobertura con apoyo',
        'Revisitas',
        'Tiempo en unidades',
        'Días-persona de vacaciones',
      ],
    ],
    body: [
      [
        s.completedVisits,
        formatPercent(s.personalCoveragePct),
        formatPercent(s.serviceCoveragePct),
        s.repeatVisits,
        formatPresence(s.effectiveSeconds),
        s.vacationDays,
      ],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 180] },
    margin: { left: 12, right: 12 },
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [
      [
        'Persona',
        'Asignadas',
        'Visitadas propias',
        'Cobertura propia',
        'Con apoyo',
        'Visitas',
        'Revisitas',
        'Tiempo en unidades',
        'Vacaciones',
      ],
    ],
    body: report.people.map((p) => [
      p.name,
      p.assignedPharmacies,
      p.visitedAssigned,
      formatPercent(p.personalCoveragePct),
      p.servicedAssigned,
      p.completedVisits,
      p.repeatVisits,
      formatPresence(p.effectiveSeconds),
      p.vacationDays,
    ]),
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [22, 38, 62] },
    margin: { top: 15, bottom: 23, left: 12, right: 12 },
  })
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [
      [
        'Periodo mensual consultado',
        'Visitas',
        'Farmacias visitadas',
        'Revisitas',
        'Cobertura propia',
        'Con apoyo',
        'Tiempo en unidades',
      ],
    ],
    body: report.periods.monthly.map((p) => [
      `${p.startDate} a ${p.endDate}`,
      p.completedVisits,
      p.uniquePharmacies,
      p.repeatVisits,
      formatPercent(p.personalCoveragePct),
      formatPercent(p.serviceCoveragePct),
      formatPresence(p.effectiveSeconds),
    ]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [22, 38, 62] },
    margin: { top: 15, bottom: 23, left: 12, right: 12 },
  })
  const count = doc.internal.getNumberOfPages()
  for (let i = 1; i <= count; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(80)
    doc.text(
      'Tiempo registrado entre entrada y salida; sin traslados. Sólo registros sincronizados. Cobertura sobre asignaciones vigentes durante el intervalo.',
      12,
      198
    )
    doc.text(`${i} / ${count}`, 280, 205, { align: 'right' })
  }
  doc.save(
    `farmacias-resumen-${report.period.startDate}-${report.period.endDate}.pdf`
  )
}
