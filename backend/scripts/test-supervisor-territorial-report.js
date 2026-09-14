import assert from 'node:assert/strict'
import { exportTerritorialReport, territorialTime } from '../../src/utils/territorialReport.js'
const result = { supervisor: { nombre: 'Supervisor de prueba' }, supervisor_id: 'prueba',
  origin: { name: 'Origen de prueba', address: 'Dirección de prueba', lat: 20, lng: -103 },
  calculatedAt: '2026-09-12T12:00:00Z', totalUnits: 81, consideredUnits: 80,
  returnToOrigin: true, distanceMeters: 650000, drivingSeconds: 50400, status: 'WARNING',
  warnings: ['Una unidad sin coordenadas.'], missingCoordinates: [{ name: 'Sin ubicación', clues: 'TEST' }],
  sequence: Array.from({ length: 80 }, (_, i) => ({ order: i + 1, clues: `TEST${i}`, name: `Unidad con nombre extenso para comprobar saltos de página ${i}`, estado: 'Jalisco', proyecto: 'Prueba' })) }
const individual = await exportTerritorialReport({ results: [result] }, { save: false })
assert.ok(individual.getNumberOfPages() > 1)
assert.ok(individual.output('arraybuffer').byteLength > 1000)
const general = await exportTerritorialReport({ results: [result, { ...result, supervisor_id: 'otro', status: 'ERROR', error: { code: 'ORIGIN_REQUIRED', message: 'Origen no configurado' } }],
  summary: { supervisorsConsidered: 2, supervisorsCalculated: 1, supervisorsWithError: 1, totalUnits: 162, distanceMeters: 650000, drivingSeconds: 50400, averageKmPerSupervisor: 650, highestLoad: result.supervisor, lowestLoad: result.supervisor } }, { save: false })
assert.ok(general.getNumberOfPages() > individual.getNumberOfPages())
assert.equal(territorialTime(3599), '1 h 0 min')
assert.equal(territorialTime(50400), '14 h 0 min')
console.log(`PASS: PDF individual (${individual.getNumberOfPages()} páginas) y general (${general.getNumberOfPages()} páginas), secuencia extensa, errores y duración sin límite diario.`)
