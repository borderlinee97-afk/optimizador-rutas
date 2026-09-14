export const territorialKm = value => value == null ? '—' : (value / 1000).toFixed(1)
export const territorialTime = value => value == null ? '—' : `${Math.floor(Math.round(value / 60) / 60)} h ${Math.round(value / 60) % 60} min`

// Mismo mecanismo que PlanTrabajoPrintView: PDF cliente con jsPDF/autoTable.
// Exporta exactamente el resultado calculado, sin nuevas llamadas a Google.
export async function exportTerritorialReport({ results, summary, calculatedAt }, { save = true } = {}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF()
  let y = 18
  const paragraph = (text, size = 10) => {
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(String(text), 180)
    for (const line of lines) {
      if (y > 276) { doc.addPage(); y = 18 }
      doc.text(line, 14, y); y += size * 0.45 + 2
    }
  }
  const table = (head, body) => {
    autoTable(doc, { startY: y, head: [head], body, margin: { top: 18, bottom: 18 },
      styles: { fontSize: 8, overflow: 'linebreak' }, headStyles: { fillColor: [15, 100, 173] } })
    y = doc.lastAutoTable.finalY + 9
  }
  paragraph('Ruta territorial del supervisor', 17)
  paragraph('Carga teórica permanente. Solo conducción; no incluye visitas ni jornadas.')
  paragraph(`Fecha: ${calculatedAt || results[0]?.calculatedAt || new Date().toISOString()}`)
  if (summary) {
    paragraph(`Supervisores: ${summary.supervisorsConsidered} | Calculados: ${summary.supervisorsCalculated} | Errores: ${summary.supervisorsWithError}`)
    paragraph(`Unidades: ${summary.totalUnits} | Km acumulados: ${territorialKm(summary.distanceMeters)} | Tiempo: ${territorialTime(summary.drivingSeconds)}`)
    paragraph(`Promedio: ${summary.averageKmPerSupervisor?.toFixed(1) ?? '—'} km/supervisor calculado`)
    paragraph(`Mayor carga: ${summary.highestLoad?.nombre || '—'} | Menor carga: ${summary.lowestLoad?.nombre || '—'}`)
    table(['Supervisor', 'Unidades', 'Km', 'Conducción', 'Origen', 'Regreso', 'Estado'], results.map(r => [
      r.supervisor.nombre, r.totalUnits, territorialKm(r.distanceMeters), territorialTime(r.drivingSeconds),
      r.origin?.name || 'Sin configurar', r.returnToOrigin ? 'Sí' : 'No', r.status,
    ]))
  }
  for (let index = 0; index < results.length; index++) {
    const r = results[index]
    if (summary || index) { doc.addPage(); y = 18 }
    paragraph(r.supervisor.nombre, 15)
    paragraph(`Supervisor ID: ${r.supervisor_id}`)
    paragraph(`Fecha del cálculo: ${r.calculatedAt}`)
    paragraph(`Origen: ${r.origin?.name || 'Sin configurar'} | ${r.origin?.address || ''}`)
    if (r.origin) paragraph(`Coordenadas: ${r.origin.lat}, ${r.origin.lng}`)
    paragraph(`Unidades: ${r.totalUnits} | Consideradas: ${r.consideredUnits ?? '—'} | Regreso al origen: ${r.returnToOrigin ? 'Sí' : 'No'}`)
    paragraph(`Distancia: ${territorialKm(r.distanceMeters)} km | Conducción: ${territorialTime(r.drivingSeconds)} | Estado: ${r.status}`)
    if (r.error) { paragraph(`Error: ${r.error.code} - ${r.error.message}`); continue }
    paragraph(`Estado(s): ${[...new Set([...r.sequence, ...r.missingCoordinates].map(p => p.estado).filter(Boolean))].join(', ') || '—'}`)
    paragraph(`Proyecto(s): ${[...new Set([...r.sequence, ...r.missingCoordinates].map(p => p.proyecto).filter(Boolean))].join(', ') || '—'}`)
    for (const warning of r.warnings) paragraph(`Aviso: ${warning}`)
    table(['Orden', 'CLUES', 'Unidad', 'Estado / proyecto'], r.sequence.map(p => [p.order, p.clues, p.name, `${p.estado || ''} / ${p.proyecto || ''}`]))
    if (r.returnToOrigin) paragraph(`Regreso: ${r.origin.name}`)
    if (r.missingCoordinates.length) table(['Sin coordenadas: CLUES', 'Unidad'], r.missingCoordinates.map(p => [p.clues, p.name]))
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFontSize(8); doc.text(`${page} / ${pages}`, 185, 289)
  }
  if (save) doc.save(`ruta-territorial-${summary ? 'general' : results[0].supervisor_id}-${Date.now()}.pdf`)
  return doc
}
