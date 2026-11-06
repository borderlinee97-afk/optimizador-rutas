import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTerritorialRoute, calculateAllTerritories, normalizeOrigin, normalizeReturnToOrigin,
  validCoordinates, getTerritory, listTerritorialSupervisors, optimizeTerritorialOrder } from '../services/supervisorTerritorialRoute.service.js'

const origin = { name: 'Base A', lat: 20, lng: -103 }
const supervisor = { id: '11111111-1111-1111-1111-111111111111', nombre: 'Supervisor A', origin, units_count: 27 }
const units = Array.from({ length: 27 }, (_, i) => ({ id: i + 1, name: `Unidad ${i + 1}`, lat: 20 + (27 - i) / 100, lng: -103 + i / 100 }))
const territory = { supervisor, origin, units }
const provider = async request => ({ distanceMeters: 325000, duration: '25200s', polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
  legs: Array.from({ length: request.intermediates.length + 1 }, () => ({ duration: '1s', distanceMeters: 1 })),
  optimizedIntermediateWaypointIndex: request.intermediates.map((_, i) => request.intermediates.length - i - 1) })

test('retorno predeterminado backend y validación estricta', () => {
  assert.equal(normalizeReturnToOrigin(undefined), true)
  assert.equal(normalizeReturnToOrigin(false), false)
  for (const value of [null, 'false', 0, {}, []]) assert.throws(() => normalizeReturnToOrigin(value), { code: 'INVALID_RETURN_TO_ORIGIN' })
})
test('origen exige coordenadas reales, no convierte null/vacío a cero', () => {
  for (const value of [null, undefined, '', ' ', true, [], Infinity, 91]) {
    assert.equal(Boolean(validCoordinates({ lat: value, lng: 0 })), false)
    assert.throws(() => normalizeOrigin({ name: 'Base', lat: value, lng: 0 }), { code: 'INVALID_ORIGIN' })
  }
  assert.equal(normalizeOrigin({ name: 'Base', lat: '0', lng: '0' }).lat, 0)
})
test('27 unidades, 650 km y 14 horas conservan una sola ruta cerrada', async () => {
  const requests = []
  const result = await calculateTerritorialRoute(territory, {}, async req => { requests.push(req); return provider(req) })
  assert.equal(result.type, 'SUPERVISOR_TOTAL_ROUTE')
  assert.equal(result.distanceMeters, 650000); assert.equal(result.drivingSeconds, 50400)
  assert.equal(result.returnToOrigin, true); assert.equal(result.consideredUnits, 27)
  assert.equal(new Set(result.sequence.map(p => p.id)).size, 27)
  assert.equal(requests.length, 2); assert.deepEqual(requests[0].origin, result.origin)
  assert.deepEqual(requests[0].destination, requests[1].origin)
  assert.deepEqual(requests.at(-1).destination, result.origin)
  assert.equal(result.legs.length, 28); assert.equal(result.polylines.length, 2)
  assert.equal(requests.every(r => r.intermediates.length <= 25 && !r.optimizeWaypointOrder), true)
  assert.equal('days' in result, false)
})
test('Google optimiza hasta 25 unidades y la secuencia refleja sus índices', async () => {
  const input = { ...territory, units: units.slice(0, 25) }
  const ordered = optimizeTerritorialOrder(input.units, origin, true)
  const result = await calculateTerritorialRoute(input, {}, async req => {
    assert.equal(req.optimizeWaypointOrder, true); return provider(req)
  })
  assert.deepEqual(result.sequence.map(p => p.id), ordered.reverse().map(p => p.id))
})
test('no utiliza el orden de la base de datos y es determinista', () => {
  const input = [{ id: 1, lat: 25, lng: -103 }, { id: 2, lat: 21, lng: -103 }, { id: 3, lat: 23, lng: -103 }]
  assert.deepEqual(optimizeTerritorialOrder(input, origin, false).map(p => p.id), [2, 3, 1])
  assert.deepEqual(optimizeTerritorialOrder(input, origin, false), optimizeTerritorialOrder([...input].reverse(), origin, false))
})
test('retorno false explícito termina en la última unidad', async () => {
  const requests = []
  const result = await calculateTerritorialRoute(territory, { returnToOrigin: false }, async r => { requests.push(r); return provider(r) })
  assert.equal(result.returnToOrigin, false)
  assert.equal(requests.at(-1).destination.id, result.sequence.at(-1).id)
  assert.equal(result.legs.length, 27)
})
test('coordenadas faltantes quedan identificadas sin omisiones silenciosas', async () => {
  const result = await calculateTerritorialRoute({ ...territory, units: [units[0], { id: 99, name: 'Sin ubicación', lat: null, lng: null }] }, {}, provider)
  assert.equal(result.totalUnits, 2); assert.equal(result.consideredUnits, 1)
  assert.equal(result.missingCoordinates[0].id, 99); assert.equal(result.status, 'WARNING')
  await assert.rejects(calculateTerritorialRoute({ ...territory, units: [{ lat: null, lng: null }] }, {}, provider), { code: 'NO_VALID_COORDINATES' })
})
test('territorio vacío tiene cero métricas y no consume Google', async () => {
  const result = await calculateTerritorialRoute({ ...territory, units: [] }, {}, () => assert.fail('No debe llamar a Google'))
  assert.equal(result.distanceMeters, 0); assert.equal(result.drivingSeconds, 0); assert.equal(result.returnToOrigin, true)
})
test('unidad usada como origen conserva su visita sin desplazamiento artificial', async () => {
  const result = await calculateTerritorialRoute({ ...territory, units: [{ id: 1, name: 'Unidad base', lat: origin.lat, lng: origin.lng }] }, {}, () => assert.fail('No requiere Google'))
  assert.equal(result.consideredUnits, 1); assert.equal(result.distanceMeters, 0)
  assert.equal(result.returnToOrigin, true); assert.equal(result.legs.length, 2)
})
test('no acepta trazado o secuencia incompletos del proveedor', async () => {
  await assert.rejects(calculateTerritorialRoute(territory, {}, async () => null), { code: 'TERRITORIAL_ROUTE_UNAVAILABLE' })
  await assert.rejects(calculateTerritorialRoute({ ...territory, units: units.slice(0, 2) }, {}, async () => ({ ...await provider({ intermediates: [] }), optimizedIntermediateWaypointIndex: [0, 0] })), { code: 'INVALID_OPTIMIZED_SEQUENCE' })
})
test('cálculo general aísla fallos y consolida únicamente resultados independientes', async () => {
  const b = { ...supervisor, id: 'B', nombre: 'Supervisor B', units_count: 3, origin: null }
  const c = { ...supervisor, id: 'C', nombre: 'Supervisor C', units_count: 1 }
  const called = []
  const batch = await calculateAllTerritories([supervisor, b, c], async s => {
    called.push(s.id)
    if (s.id === 'B') throw Object.assign(new Error('Origen requerido'), { code: 'ORIGIN_REQUIRED' })
    return { supervisor: s, status: 'OK', totalUnits: s.units_count, distanceMeters: s.id === 'C' ? 1000 : 650000, drivingSeconds: 100 }
  })
  assert.deepEqual(called, [supervisor.id, 'B', 'C'])
  assert.equal(batch.summary.supervisorsCalculated, 2); assert.equal(batch.summary.supervisorsWithError, 1)
  assert.equal(batch.summary.distanceMeters, 651000); assert.equal(batch.summary.totalUnits, 31)
  assert.equal(batch.summary.averageKmPerSupervisor, 325.5)
  assert.equal(batch.summary.highestLoad.id, supervisor.id); assert.equal(batch.summary.lowestLoad.id, 'C')
  assert.equal(batch.results[1].error.code, 'ORIGIN_REQUIRED')
})
test('área o rol inválidos se rechazan antes de consultar datos', async () => {
  const db = { query: () => assert.fail('No debe consultar') }
  await assert.rejects(listTerritorialSupervisors(db, { area: 'OPERACIONES', rol: 'GERENTE' }), { status: 403 })
  await assert.rejects(listTerritorialSupervisors(db, { area: 'FARMACIAS', rol: 'OTRO' }), { status: 403 })
})
test('ID externo al alcance jamás consulta unidades ni acepta inyección', async () => {
  let queries = 0
  const db = { query: async () => { queries++; return { rows: [] } } }
  const actor = { id: supervisor.id, area: 'FARMACIAS', rol: 'SUPERVISOR', pharmacy_scope_mode: 'ALL' }
  await assert.rejects(getTerritory(db, actor, supervisor.id), { code: 'SUPERVISOR_NOT_ALLOWED' })
  assert.equal(queries, 1)
  await assert.rejects(getTerritory(db, actor, "' OR 1=1"), { code: 'INVALID_SUPERVISOR_ID' })
  assert.equal(queries, 1)
})
