import { computeGoogleRoute, parseGoogleDurationSeconds } from '../routing/providers/googleRoutes.provider.js'
import { haversine, nearestNeighborOrder } from '../routing/utils/geo.js'
import { normalizePharmacyScopeMode } from './pharmacyAccess.service.js'

export function territorialError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

export function validCoordinates(point) {
  return point && ['lat', 'lng'].every(key =>
    (typeof point[key] === 'number' || typeof point[key] === 'string') &&
    String(point[key]).trim() !== '' && Number.isFinite(Number(point[key]))) &&
    Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180
}

export function normalizeOrigin(value) {
  if (!validCoordinates(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 ||
      (value.address != null && (typeof value.address !== 'string' || value.address.length > 2000)) ||
      (value.google_place_id != null && (typeof value.google_place_id !== 'string' || value.google_place_id.length > 500))) {
    throw territorialError(400, 'INVALID_ORIGIN', 'Indica un nombre y coordenadas válidas para el origen')
  }
  return { name: value.name.trim(), address: value.address?.trim() || '', lat: Number(value.lat), lng: Number(value.lng), google_place_id: value.google_place_id || null }
}

export function normalizeReturnToOrigin(value) {
  if (value === undefined) return true
  if (typeof value !== 'boolean') throw territorialError(400, 'INVALID_RETURN_TO_ORIGIN', 'returnToOrigin debe ser booleano')
  return value
}

// Base permanente, deliberadamente sin coberturas ni fecha efectiva.
// El modo ALL amplía consulta de farmacias, nunca las asignaciones del territorio.
export async function listTerritorialSupervisors(db, actor, { includeUnits = false, supervisorId = null } = {}) {
  if (actor.area !== 'FARMACIAS' || !['GERENTE', 'COORDINADOR', 'SUPERVISOR'].includes(actor.rol)) {
    throw territorialError(403, 'TERRITORY_NOT_ALLOWED', 'Acceso exclusivo a la estructura de Farmacias')
  }
  const { rows } = await db.query(`
    SELECT s.id, s.nombre, s.superior_id, s.pharmacy_scope_mode,
      (SELECT count(DISTINCT a.pharmacy_id)::int FROM public.pharmacy_supervisor_assignment a
       WHERE a.supervisor_id = s.id AND a.revoked_at IS NULL) AS units_count,
      row_to_json(o) AS origin,
      CASE WHEN $4::boolean THEN (SELECT coalesce(json_agg(u ORDER BY u.id), '[]'::json) FROM (
        SELECT f.id, f.clues, f.unidad AS name, f.direccion AS address,
          f.estado, f.proyecto, f.latitud AS lat, f.longitud AS lng
        FROM public.farmacia f WHERE EXISTS (SELECT 1 FROM public.pharmacy_supervisor_assignment a
          WHERE a.pharmacy_id = f.id AND a.supervisor_id = s.id AND a.revoked_at IS NULL)
      ) u) ELSE NULL END AS units
    FROM public.personas s
    LEFT JOIN public.personas c ON c.id = s.superior_id
    LEFT JOIN public.supervisor_territorial_origin o ON o.supervisor_id = s.id
    WHERE s.activo = TRUE AND s.area::text = 'FARMACIAS' AND s.rol::text = 'SUPERVISOR'
      AND ($5::uuid IS NULL OR s.id = $5::uuid)
      AND (($2 = 'SUPERVISOR' AND s.id = $1)
        OR ($2 = 'COORDINADOR' AND s.superior_id = $1)
        OR ($2 = 'GERENTE' AND (s.superior_id = $1 OR
          (c.superior_id = $1 AND c.activo = TRUE AND c.area::text = 'FARMACIAS' AND c.rol::text = 'COORDINADOR')))
        OR $3 = TRUE)
      AND EXISTS (SELECT 1 FROM public.person_state_scope ss
        JOIN public.person_state_scope actor_scope ON upper(btrim(actor_scope.estado)) = upper(btrim(ss.estado))
        WHERE ss.persona_id = s.id AND ss.revoked_at IS NULL
          AND actor_scope.persona_id = $1 AND actor_scope.revoked_at IS NULL)
      -- No devolver un territorio parcial ni revelar un origen de alcance mixto.
      AND NOT EXISTS (
        SELECT 1 FROM public.pharmacy_supervisor_assignment a
        JOIN public.farmacia f ON f.id = a.pharmacy_id
        WHERE a.supervisor_id = s.id AND a.revoked_at IS NULL AND (
          NOT EXISTS (SELECT 1 FROM public.person_state_scope ps
            WHERE ps.persona_id = $1 AND ps.revoked_at IS NULL AND upper(btrim(ps.estado)) = upper(btrim(f.estado)))
          OR NOT EXISTS (SELECT 1 FROM public.person_state_scope ps
            WHERE ps.persona_id = s.id AND ps.revoked_at IS NULL AND upper(btrim(ps.estado)) = upper(btrim(f.estado)))
          OR ($2 = 'COORDINADOR' AND $3 = FALSE AND NOT EXISTS (
            SELECT 1 FROM public.pharmacy_coordinator_assignment ca
            WHERE ca.pharmacy_id = f.id AND ca.coordinator_id = $1 AND ca.revoked_at IS NULL))
          OR ($2 = 'GERENTE' AND $3 = FALSE AND EXISTS (
            SELECT 1 FROM public.pharmacy_coordinator_assignment ca
            JOIN public.personas coordinator ON coordinator.id = ca.coordinator_id
            WHERE ca.pharmacy_id = f.id AND ca.revoked_at IS NULL
              AND coordinator.activo = TRUE AND coordinator.area::text = 'FARMACIAS'
              AND coordinator.rol::text = 'COORDINADOR' AND coordinator.superior_id IS DISTINCT FROM $1::uuid
              AND f.estatus::text IS DISTINCT FROM 'INACTIVA'))
        ))
    ORDER BY s.nombre, s.id`, [actor.id, actor.rol, actor.system_role === 'ADMIN', includeUnits, supervisorId])
  return rows.map(s => ({ ...s, pharmacy_scope_mode: normalizePharmacyScopeMode(s.pharmacy_scope_mode) }))
}

export async function getTerritory(db, actor, supervisorId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supervisorId || '')) {
    throw territorialError(400, 'INVALID_SUPERVISOR_ID', 'Identificador de supervisor inválido')
  }
  // Autorización y unidades comparten la misma instantánea SQL; no hay una
  // segunda consulta que pueda incorporar asignaciones cambiadas entre ambas.
  const entry = (await listTerritorialSupervisors(db, actor, { includeUnits: true, supervisorId }))[0]
  const { units, ...supervisor } = entry || {}
  if (!entry) throw territorialError(403, 'SUPERVISOR_NOT_ALLOWED', 'Supervisor fuera de tu alcance autorizado')
  return { supervisor, origin: supervisor.origin, assignmentMode: 'PERMANENT', units }
}

// Optimización global geométrica para territorios que exceden el límite de Routes.
// 2-opt no impone jornadas ni topes de duración; después Google mide por carretera.
export function optimizeTerritorialOrder(units, origin, returnToOrigin) {
  const ordered = nearestNeighborOrder([...units].sort((a, b) => String(a.id).localeCompare(String(b.id))), origin)
  for (let pass = 0; pass < 20; pass++) {
    let improved = false
    for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const a = i ? ordered[i - 1] : origin
        const b = ordered[i], c = ordered[j], d = ordered[j + 1] || (returnToOrigin ? origin : null)
        const before = haversine(a, b) + (d ? haversine(c, d) : 0)
        const after = haversine(a, c) + (d ? haversine(b, d) : 0)
        if (after + 0.000001 < before) {
          ordered.splice(i, j - i + 1, ...ordered.slice(i, j + 1).reverse())
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return ordered
}

export async function calculateTerritorialRoute(territory, options = {}, routeProvider = computeGoogleRoute) {
  const returnToOrigin = normalizeReturnToOrigin(options.returnToOrigin)
  const origin = normalizeOrigin(options.origin ?? territory.origin ?? {})
  const missingCoordinates = territory.units.filter(p => !validCoordinates(p))
  const units = territory.units.filter(validCoordinates).map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }))
  let sequence = optimizeTerritorialOrder(units, origin, returnToOrigin)
  const warnings = ['Carga territorial teórica: solo conducción, sin visitas, jornadas ni recursos.']
  if (missingCoordinates.length) warnings.push(`${missingCoordinates.length} unidades excluidas por coordenadas ausentes o inválidas.`)
  if (territory.units.length && !units.length) throw territorialError(422, 'NO_VALID_COORDINATES', 'Ninguna unidad asignada tiene coordenadas válidas; consulta el detalle territorial')
  const googleOptimized = returnToOrigin && units.length > 1 && units.length <= 25
  if (!googleOptimized && units.length > 1) warnings.push('Orden optimizado mediante vecino más cercano y 2-opt geográfico; métricas y trazado por carretera de Google Routes. No garantiza el óptimo vial global.')
  const polylines = [], legs = []
  let distanceMeters = 0, drivingSeconds = 0
  const points = [origin, ...sequence, ...(returnToOrigin && sequence.length ? [origin] : [])]
  // Fragmentación únicamente de transporte API: se conserva un único circuito,
  // con extremos compartidos, sin optimizar fragmentos de manera independiente.
  for (let start = 0; start < points.length - 1; start += 26) {
    const segment = points.slice(start, start + 27)
    if (segment.every(p => p.lat === segment[0].lat && p.lng === segment[0].lng)) {
      // Una unidad puede ser también el origen. Conserva su visita con cero
      // desplazamiento sin exigir a Google un trayecto entre puntos idénticos.
      legs.push(...segment.slice(1).map(() => ({ distanceMeters: 0, duration: '0s' })))
      continue
    }
    const route = await routeProvider({ origin: segment[0], destination: segment.at(-1),
      intermediates: segment.slice(1, -1), optimizeWaypointOrder: googleOptimized,
      routingPreference: 'TRAFFIC_UNAWARE', includeTolls: false, signal: AbortSignal.timeout(45000) })
    const duration = parseGoogleDurationSeconds(route?.duration)
    if (!route || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || duration === null || !route.polyline?.encodedPolyline) {
      throw territorialError(502, 'TERRITORIAL_ROUTE_UNAVAILABLE', 'Google no devolvió una ruta completa con distancia, duración y trazado')
    }
    if (googleOptimized) {
      const order = route.optimizedIntermediateWaypointIndex
      if (!Array.isArray(order) || order.length !== sequence.length || new Set(order).size !== sequence.length ||
          order.some(i => !Number.isInteger(i) || i < 0 || i >= sequence.length)) {
        throw territorialError(502, 'INVALID_OPTIMIZED_SEQUENCE', 'Google no devolvió una secuencia completa de unidades')
      }
      sequence = order.map(i => sequence[i])
    }
    distanceMeters += route.distanceMeters
    drivingSeconds += duration
    polylines.push(route.polyline.encodedPolyline)
    if (Array.isArray(route.legs)) legs.push(...route.legs)
  }
  return { type: 'SUPERVISOR_TOTAL_ROUTE', assignmentMode: 'PERMANENT', supervisor: territory.supervisor,
    supervisor_id: territory.supervisor.id, origin, totalUnits: territory.units.length,
    consideredUnits: sequence.length, missingCoordinates, sequence: sequence.map((p, i) => ({ ...p, order: i + 1 })),
    distanceMeters, drivingSeconds, polylines, legs, returnToOrigin, warnings,
    optimization: googleOptimized ? 'GOOGLE_ROUTES' : 'NEAREST_NEIGHBOR_2OPT',
    calculatedAt: new Date().toISOString(), status: missingCoordinates.length ? 'WARNING' : 'OK' }
}

export function summarizeTerritorialResults(results) {
  const successful = results.filter(r => r.status !== 'ERROR')
  const byDistance = [...successful].sort((a, b) => a.distanceMeters - b.distanceMeters)
  const distanceMeters = successful.reduce((sum, r) => sum + r.distanceMeters, 0)
  return { supervisorsConsidered: results.length, supervisorsCalculated: successful.length,
    supervisorsWithError: results.length - successful.length, totalUnits: results.reduce((sum, r) => sum + r.totalUnits, 0),
    distanceMeters, drivingSeconds: successful.reduce((sum, r) => sum + r.drivingSeconds, 0),
    averageKmPerSupervisor: successful.length ? distanceMeters / 1000 / successful.length : null,
    highestLoad: byDistance.at(-1)?.supervisor ?? null, lowestLoad: byDistance[0]?.supervisor ?? null }
}

export async function calculateAllTerritories(supervisors, calculate, returnToOrigin = true) {
  normalizeReturnToOrigin(returnToOrigin)
  const results = []
  for (const supervisor of supervisors) {
    try { results.push(await calculate(supervisor)) }
    catch (error) { results.push({ supervisor, supervisor_id: supervisor.id, origin: supervisor.origin,
      totalUnits: supervisor.units_count, returnToOrigin, status: 'ERROR',
      error: { code: error.code || 'TERRITORIAL_CALCULATION_FAILED', message: error.message }, calculatedAt: new Date().toISOString() }) }
  }
  return { results, summary: summarizeTerritorialResults(results), calculatedAt: new Date().toISOString() }
}
