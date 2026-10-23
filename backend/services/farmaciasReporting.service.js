import { buildFollowUp } from './farmaciasFollowUp.service.js'
// Read-only reporting. Recorded presence in units is not a payroll/workday measure.
export const REPORT_TIME_ZONE = 'America/Mexico_City'
const ROLES = new Set(['DIRECTOR', 'GERENTE', 'COORDINADOR'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const timeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status })
export const localDay = (value) => dayFormatter.format(new Date(value))
export const nextDay = (day) =>
  new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10)
const midnightCache = new Map()
export function midnight(day) {
  if (midnightCache.has(day)) return midnightCache.get(day)
  const target = Date.parse(day + 'T00:00:00Z')
  let guess = target + 6 * 3600000
  for (let n = 0; n < 3; n++) {
    const parts = Object.fromEntries(
      timeFormatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value])
    )
    const displayed = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`
    )
    guess += target - displayed
  }
  if (midnightCache.size >= 2048) midnightCache.clear()
  midnightCache.set(day, guess)
  return guess
}
const iso = (value) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : null
export function executionDetails(row) {
  const checkInAt = iso(row.check_in_at),
    checkOutAt = iso(row.check_out_at)
  const valid =
    !!checkInAt &&
    !!checkOutAt &&
    Date.parse(checkOutAt) >= Date.parse(checkInAt)
  const notCompleted = row.status === 'SKIPPED' && !!checkInAt && !checkOutAt
    && String(row.skip_reason ?? '').startsWith('CIERRE_ADMINISTRATIVO_NO_FINALIZADA:')
  return {
    notCompleted,
    checkInAt,
    checkOutAt,
    dwellSeconds: valid
      ? Math.floor((Date.parse(checkOutAt) - Date.parse(checkInAt)) / 1000)
      : null,
    executionIssue:
      notCompleted ? 'Cierre administrativo: visita no finalizada; sin salida registrada' :
      checkOutAt && !checkInAt
        ? 'Salida sin entrada'
        : checkInAt && checkOutAt && !valid
          ? 'Salida anterior a entrada'
          : row.status === 'DONE' && !valid
            ? 'Visita finalizada sin ambas marcas de tiempo'
            : null,
  }
}
export function validateReportFilters(query = {}) {
  const f = {}
  for (const key of ['startDate', 'endDate']) {
    const v = query[key]
    if (
      typeof v !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
      !Number.isFinite(Date.parse(v + 'T00:00:00Z')) ||
      new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v
    )
      throw fail('Indica fechas de calendario válidas.')
    f[key] = v
  }
  const days = (Date.parse(f.endDate) - Date.parse(f.startDate)) / 86400000
  if (days < 0 || days > 365)
    throw fail(
      'Consulta un periodo de hasta 366 días, con la fecha final posterior a la inicial.'
    )
  for (const key of ['personId', 'coordinatorId']) {
    if (
      query[key] &&
      (typeof query[key] !== 'string' || !UUID.test(query[key]))
    )
      throw fail('El filtro de personal no es válido.')
    f[key] = query[key] || null
  }
  for (const key of ['project', 'jurisdiction', 'state']) {
    if (
      query[key] &&
      (typeof query[key] !== 'string' || query[key].length > 160)
    )
      throw fail('El filtro territorial no es válido.')
    f[key] = query[key]?.trim() || null
  }
  if (query.pharmacyId && !/^[1-9]\d{0,18}$/.test(String(query.pharmacyId)))
    throw fail('La unidad no es válida.')
  f.pharmacyId = query.pharmacyId ? String(query.pharmacyId) : null
  f.page = Number(query.page ?? 1)
  f.pageSize = Number(query.pageSize ?? 50)
  if (
    !Number.isInteger(f.page) ||
    f.page < 1 ||
    f.page > 100000 ||
    !Number.isInteger(f.pageSize) ||
    f.pageSize < 1 ||
    f.pageSize > 200
  )
    throw fail('La paginación no es válida.')
  return f
}
export async function reportingPeople(db, actor) {
  if (!actor?.activo || actor.area !== 'FARMACIAS' || !ROLES.has(actor.rol))
    throw fail(
      'Los reportes requieren un perfil activo de dirección, gerencia o coordinación de Farmacias.',
      403
    )
  const { rows } = await db.query(
    `WITH RECURSIVE scope(id) AS (
    SELECT id FROM public.personas WHERE activo AND area::text='FARMACIAS' AND (id=$1::uuid OR $2::boolean)
    UNION
    SELECT p.id FROM public.personas p JOIN scope parent
      ON p.superior_id=parent.id OR public.puebla_shared_supervisor(parent.id,p.id)
    WHERE p.activo AND p.area::text='FARMACIAS'
  ) SELECT p.id, p.nombre AS name, p.rol::text AS role,
    COALESCE(array_agg(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL),ARRAY[]::uuid[]) AS coordinator_ids,
    COALESCE(array_agg(DISTINCT c.nombre) FILTER (WHERE c.id IS NOT NULL),ARRAY[]::text[]) AS coordinator_names,
    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',c.id,'name',c.nombre)) FILTER (WHERE c.id IS NOT NULL),'[]'::jsonb) AS coordinators
  FROM scope JOIN public.personas p ON p.id=scope.id
  LEFT JOIN public.personas c ON c.activo AND c.area::text='FARMACIAS' AND c.rol::text='COORDINADOR'
    AND (p.superior_id=c.id OR public.puebla_shared_supervisor(c.id,p.id))
  WHERE p.rol::text IN ('SUPERVISOR','COORDINADOR')
  GROUP BY p.id,p.nombre,p.rol ORDER BY p.nombre`,
    [actor.id, actor.system_role === 'ADMIN']
  )
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    coordinatorIds: p.coordinator_ids,
    coordinatorNames: p.coordinator_names,
    coordinators: p.coordinators,
  }))
}
const warehouse = `upper(trim(COALESCE(f.lugar_farmacia,''))) IN ('ALMACEN','ALMACENES','CEDIS','REGIONES SANITARIAS') OR EXISTS
  (SELECT 1 FROM public.pharmacy_shared_plan_access s WHERE s.pharmacy_id=f.id)`
// The identical dimension predicate is applied to assignments, coverage and visits.
const dimensions = `($4::text IS NULL OR upper(trim(f.proyecto))=upper($4))
  AND ($5::text IS NULL OR upper(trim(f.region_sanitaria))=upper($5))
  AND ($6::text IS NULL OR upper(trim(f.estado))=upper($6))
  AND ($7::bigint IS NULL OR f.id=$7::bigint)`
const unitFields = `f.id::text AS pharmacy_id, f.clues, f.unidad AS unit_name, f.proyecto AS project,
  f.region_sanitaria AS jurisdiction, f.estado AS state, (${warehouse}) AS warehouse, upper(trim(COALESCE(f.lugar_farmacia,'')))='REGIONES SANITARIAS' AS sanitary_region`
export async function loadReportingData(db, actor, filters) {
  const people = await reportingPeople(db, actor)
  if (filters.personId && !people.some((p) => p.id === filters.personId))
    throw fail('El personal no pertenece a tu estructura autorizada.', 403)
  if (
    filters.coordinatorId &&
    !people.some(
      (p) =>
        (p.id === filters.coordinatorId && p.role === 'COORDINADOR') ||
        p.coordinatorIds.includes(filters.coordinatorId)
    )
  )
    throw fail('La coordinación no pertenece a tu estructura autorizada.', 403)
  const selected = people.filter(
    (p) =>
      (!filters.personId || p.id === filters.personId) &&
      (!filters.coordinatorId ||
        p.id === filters.coordinatorId ||
        p.coordinatorIds.includes(filters.coordinatorId))
  )
  const params = [
    selected.map((p) => p.id),
    filters.startDate,
    filters.endDate,
    filters.project,
    filters.jurisdiction,
    filters.state,
    filters.pharmacyId,
  ]
  const assignments = (
    await db.query(
      `SELECT a.supervisor_id AS person_id,a.assigned_at,a.revoked_at,${unitFields}
    FROM public.pharmacy_supervisor_assignment a JOIN public.farmacia f ON f.id=a.pharmacy_id
    WHERE a.supervisor_id=ANY($1::uuid[])
      AND a.assigned_at < (($3::date+1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')
      AND (a.revoked_at IS NULL OR a.revoked_at > ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}'))
      AND ${dimensions}`,
      params
    )
  ).rows
  const coverages = (
    await db.query(
      `SELECT c.id,c.titular_supervisor_id,c.covering_supervisor_id,
      cp.nombre AS covering_name,tp.nombre AS titular_name,c.start_date::text,c.end_date::text,
      COALESCE(c.reviewed_at,c.requested_at) AS approved_at,c.cancelled_at,c.status,${unitFields}
    FROM public.pharmacy_supervisor_coverage c JOIN public.farmacia f ON f.id=c.pharmacy_id
    JOIN public.personas cp ON cp.id=c.covering_supervisor_id
    LEFT JOIN public.personas tp ON tp.id=c.titular_supervisor_id
    WHERE (c.covering_supervisor_id=ANY($1::uuid[]) OR c.titular_supervisor_id=ANY($1::uuid[]))
      AND (c.status='APPROVED' OR (c.status='CANCELLED' AND c.reviewed_at IS NOT NULL)) AND c.start_date<=$3::date AND c.end_date>=$2::date
      AND (c.cancelled_at IS NULL OR c.cancelled_at>($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}'))
      AND ${dimensions}`,
      params
    )
  ).rows
  const vacations = (
    await db.query(
      `SELECT id,supervisor_id AS person_id,start_date::text,end_date::text
    FROM public.person_availability_request WHERE supervisor_id=ANY($1::uuid[]) AND status='APPROVED'
    AND start_date<=$3::date AND end_date>=$2::date ORDER BY start_date`,
      params.slice(0, 3)
    )
  ).rows
  // Other-team visitors are visible ONLY for approved temporary coverage of a scoped titular's unit.
  const visits = (
    await db.query(
      `SELECT v.id,v.plan_id,p.supervisor_id AS person_id,person.nombre AS person_name,
      p.status AS plan_status,p.plan_type,v.item_type,v.source,v.status,v.scheduled_date::text,v.scheduled_time::text,
      v.check_in_at,v.check_out_at,v.dwell_seconds,v.notes,v.skip_reason,v.reschedule_reason,v.cancellation_request_notes,
      COALESCE(f.unidad,v.custom_name,'Actividad sin nombre') AS name,${unitFields}
    FROM public.work_plan_item v JOIN public.work_plan p ON p.id=v.plan_id
    JOIN public.personas person ON person.id=p.supervisor_id AND person.area::text='FARMACIAS'
    LEFT JOIN public.farmacia f ON f.id=v.pharmacy_id
    WHERE v.removed_at IS NULL AND (p.status='APPROVED' OR (p.status='ARCHIVED' AND p.approved_at IS NOT NULL))
      AND (p.supervisor_id=ANY($1::uuid[]) OR EXISTS (
        SELECT 1 FROM public.pharmacy_supervisor_coverage c
        WHERE c.pharmacy_id=v.pharmacy_id AND c.covering_supervisor_id=p.supervisor_id
          AND c.titular_supervisor_id=ANY($1::uuid[]) AND (c.status='APPROVED' OR (c.status='CANCELLED' AND c.reviewed_at IS NOT NULL))
          AND (v.check_in_at AT TIME ZONE '${REPORT_TIME_ZONE}')::date BETWEEN c.start_date AND c.end_date
          AND v.check_in_at>=COALESCE(c.reviewed_at,c.requested_at)
          AND (c.cancelled_at IS NULL OR v.check_in_at<c.cancelled_at)))
      AND ((v.status='IN_PROGRESS' AND v.check_out_at IS NULL AND v.check_in_at < (($3::date+1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}'))
        OR v.scheduled_date BETWEEN $2::date AND $3::date
        OR v.check_in_at < (($3::date+1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')
          AND COALESCE(v.check_out_at,v.check_in_at)>=($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')
        OR v.check_out_at >= ($2::date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')
          AND v.check_out_at < (($3::date+1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}'))
      AND ${dimensions}
    ORDER BY COALESCE(v.check_in_at,v.scheduled_date::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}') DESC,v.id
    LIMIT 50001`,
      params
    )
  ).rows
  if (visits.length > 50000)
    throw fail(
      'Reduce el periodo o aplica filtros: el reporte supera 50,000 registros.',
      413
    )
  const lastVisits = (await db.query(`SELECT v.pharmacy_id::text AS pharmacy_id, max(v.check_out_at) AS last_visit_at
    FROM public.work_plan_item v JOIN public.work_plan p ON p.id=v.plan_id
    WHERE v.pharmacy_id=ANY($1::bigint[]) AND v.removed_at IS NULL AND v.status='DONE'
      AND v.check_in_at IS NOT NULL AND v.check_out_at>=v.check_in_at
      AND (p.status='APPROVED' OR (p.status='ARCHIVED' AND p.approved_at IS NOT NULL))
      AND v.check_out_at < (($2::date+1)::timestamp AT TIME ZONE '${REPORT_TIME_ZONE}')
      AND (p.supervisor_id=ANY($3::uuid[]) OR EXISTS (
        SELECT 1 FROM public.pharmacy_supervisor_coverage c WHERE c.pharmacy_id=v.pharmacy_id
          AND c.covering_supervisor_id=p.supervisor_id AND c.titular_supervisor_id=ANY($3::uuid[])
          AND (c.status='APPROVED' OR (c.status='CANCELLED' AND c.reviewed_at IS NOT NULL))
          AND (v.check_in_at AT TIME ZONE '${REPORT_TIME_ZONE}')::date BETWEEN c.start_date AND c.end_date
          AND v.check_in_at>=COALESCE(c.reviewed_at,c.requested_at)
          AND (c.cancelled_at IS NULL OR v.check_in_at<c.cancelled_at)))
    GROUP BY v.pharmacy_id`,[[...new Set(assignments.map(a=>a.pharmacy_id))],filters.endDate,selected.map(p=>p.id)])).rows
  return { people: selected, assignments, coverages, vacations, visits, lastVisits }
}
const inRange = (date, start, end) => !!date && date >= start && date <= end
function overlap(a, b, c, d) {
  return a < d && b > c
}
const dateMs = (v) => (v == null ? null : new Date(v).getTime())
function assignmentActive(a, start, end) {
  return overlap(
    dateMs(a.assigned_at),
    dateMs(a.revoked_at) ?? Infinity,
    midnight(start),
    midnight(nextDay(end))
  )
}
function coverageActive(c, start, end) {
  return overlap(
    Math.max(midnight(c.start_date), dateMs(c.approved_at) ?? -Infinity),
    Math.min(midnight(nextDay(c.end_date)), dateMs(c.cancelled_at) ?? Infinity),
    midnight(start),
    midnight(nextDay(end))
  )
}
function coverageAt(c, visit) {
  const at = dateMs(visit.checkInAt)
  return (
    c.pharmacy_id === visit.pharmacyId &&
    c.covering_supervisor_id === visit.personId &&
    at != null &&
    at >=
      Math.max(midnight(c.start_date), dateMs(c.approved_at) ?? -Infinity) &&
    at <
      Math.min(
        midnight(nextDay(c.end_date)),
        dateMs(c.cancelled_at) ?? Infinity
      )
  )
}
function unionSeconds(intervals) {
  let total = 0,
    end = -Infinity
  for (const [a, b] of intervals.sort((x, y) => x[0] - y[0])) {
    if (b > end) {
      total += b - Math.max(a, end)
      end = b
    }
  }
  return Math.floor(total / 1000)
}
function periodBounds(day, kind) {
  const d = new Date(day + 'T12:00:00Z'),
    year = d.getUTCFullYear(),
    month = d.getUTCMonth()
  if (kind === 'weekly') {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    const start = d.toISOString().slice(0, 10)
    d.setUTCDate(d.getUTCDate() + 6)
    return [start, d.toISOString().slice(0, 10)]
  }
  const prefix = day.slice(0, 7),
    last = new Date(Date.UTC(year, month + 1, 0, 12)).toISOString().slice(0, 10)
  return kind === 'monthly'
    ? [prefix + '-01', last]
    : [
        prefix + (day.slice(8) <= '15' ? '-01' : '-16'),
        day.slice(8) <= '15' ? prefix + '-15' : last,
      ]
}
export function buildReport(data, filters, allVisits = false) {
  const { startDate: start, endDate: end } = filters
  data = {
    ...data,
    coverages: data.coverages.filter((c) => coverageActive(c, start, end)),
  }
  const assignmentsByVisitor = new Map(),
    coveragesByVisitor = new Map()
  for (const a of data.assignments) {
    const key = a.person_id + ':' + a.pharmacy_id
    const rows = assignmentsByVisitor.get(key) || []
    rows.push(a)
    assignmentsByVisitor.set(key, rows)
  }
  for (const c of data.coverages) {
    const key = c.covering_supervisor_id + ':' + c.pharmacy_id
    const rows = coveragesByVisitor.get(key) || []
    rows.push(c)
    coveragesByVisitor.set(key, rows)
  }
  const selectedIds = new Set(data.people.map((p) => p.id))
  const visits = data.visits.map((row) => {
    const e = executionDetails(row),
      key = row.person_id + ':' + row.pharmacy_id,
      at = dateMs(e.checkInAt)
    const permanent =
      at != null &&
      (assignmentsByVisitor.get(key) || []).some(
        (a) =>
          at >= dateMs(a.assigned_at) && at < (dateMs(a.revoked_at) ?? Infinity)
      )
    const covered = permanent
      ? null
      : (coveragesByVisitor.get(key) || []).find((c) =>
          coverageAt(c, {
            ...e,
            pharmacyId: row.pharmacy_id,
            personId: row.person_id,
          })
        )
    return {
      id: row.id,
      planId: row.plan_id,
      personId: row.person_id,
      personName: row.person_name,
      pharmacyId: row.pharmacy_id,
      name: row.name,
      clues: row.clues,
      project: row.project,
      jurisdiction: row.jurisdiction,
      state: row.state,
      unitKind: row.sanitary_region ? 'REG_SAN' : row.warehouse
        ? 'CEDIS'
        : row.pharmacy_id
          ? 'PHARMACY'
          : 'EXTRA_STOP',
      source: row.source,
      status: row.status,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
      ...e,
      notes: row.notes,
      cancellationNotes: row.cancellation_request_notes,
      skipReason: row.skip_reason,
      rescheduleReason: row.reschedule_reason,
      activities: row.activities || [],
      coverageId: covered?.id ?? null,
      coverageTitular: covered?.titular_name ?? null,
      externalCoverage: !selectedIds.has(row.person_id),
      completed: row.status === 'DONE' && e.dwellSeconds != null,
      enteredDay: e.checkInAt ? localDay(e.checkInAt) : null,
      completedDay: e.checkOutAt ? localDay(e.checkOutAt) : null,
    }
  })
  const hasDimensions =
    filters.project ||
    filters.jurisdiction ||
    filters.state ||
    filters.pharmacyId
  const people = data.people.filter(
    (p) =>
      !hasDimensions ||
      data.assignments.some((a) => a.person_id === p.id) ||
      data.coverages.some(
        (c) =>
          c.covering_supervisor_id === p.id || c.titular_supervisor_id === p.id
      ) ||
      visits.some((v) => v.personId === p.id)
  )
  const ownVisits = visits.filter((v) => selectedIds.has(v.personId))
  const isDone = (v) => v.completed && inRange(v.completedDay, start, end)
  const done = visits.filter(isDone)
  function summarize(
    rows,
    owners,
    a = start,
    b = end,
    assignments = data.assignments,
    coverages = data.coverages
  ) {
    const ids = new Set(owners),
      records = rows.filter((v) => ids.has(v.personId)),
      completed = records.filter(
        (v) => v.completed && inRange(v.completedDay, a, b)
      )
    const pharmacyVisits = completed.filter((v) => v.unitKind === 'PHARMACY'),
      counts = new Map()
    for (const v of pharmacyVisits) {
      const k = v.personId + ':' + v.pharmacyId
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    const assigned = assignments.filter(
      (x) => ids.has(x.person_id) && !x.warehouse && assignmentActive(x, a, b)
    )
    const pairs = new Set(
        assigned.map((x) => x.person_id + ':' + x.pharmacy_id)
      ),
      assignedIds = new Set(assigned.map((x) => x.pharmacy_id))
    const personallyCovered = new Set(
      pharmacyVisits
        .filter(
          (v) =>
            pairs.has(v.personId + ':' + v.pharmacyId) &&
            assigned.some(
              (x) =>
                x.person_id === v.personId &&
                x.pharmacy_id === v.pharmacyId &&
                dateMs(v.checkInAt) >= dateMs(x.assigned_at) &&
                dateMs(v.checkInAt) < (dateMs(x.revoked_at) ?? Infinity)
            )
        )
        .map((v) => v.pharmacyId)
    )
    const others = visits.filter(
      (v) =>
        v.completed &&
        inRange(v.completedDay, a, b) &&
        v.coverageId &&
        coverages.some(
          (c) =>
            c.id === v.coverageId &&
            ids.has(c.titular_supervisor_id) &&
            assigned.some(
              (x) =>
                x.person_id === c.titular_supervisor_id &&
                x.pharmacy_id === v.pharmacyId &&
                dateMs(v.checkInAt) >= dateMs(x.assigned_at) &&
                dateMs(v.checkInAt) < (dateMs(x.revoked_at) ?? Infinity)
            )
        )
    )
    const serviced = new Set([
      ...personallyCovered,
      ...others
        .filter((v) => assignedIds.has(v.pharmacyId))
        .map((v) => v.pharmacyId),
    ])
    const time = new Map()
    for (const v of records.filter((v) => v.completed)) {
      const x = Math.max(dateMs(v.checkInAt), midnight(a)),
        y = Math.min(dateMs(v.checkOutAt), midnight(nextDay(b)))
      if (y > x) {
        const ranges = time.get(v.personId) || []
        ranges.push([x, y])
        time.set(v.personId, ranges)
      }
    }
    const planned = records.filter(
      (v) =>
        v.source === 'PLAN' &&
        inRange(v.scheduledDate, a, b) &&
        !['CANCELLED', 'RESCHEDULED'].includes(v.status)
    )
    const completedPlanned = planned.filter(
      (v) => v.completed && dateMs(v.checkOutAt) < midnight(nextDay(b))
    )
    const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null)
    const coveredByOthers = new Set(others.map((v) => v.pharmacyId))
    const activeCoverages = coverages.filter(
      (c) =>
        ids.has(c.covering_supervisor_id) &&
        !c.warehouse &&
        coverageActive(c, a, b)
    )
    return {
      completedVisits: completed.length,
      pharmacyVisits: pharmacyVisits.length,
      warehouseVisits: completed.filter((v) => v.unitKind === 'CEDIS').length,
      extraStops: completed.filter((v) => v.unitKind === 'EXTRA_STOP').length,
      uniquePharmacies: new Set(pharmacyVisits.map((v) => v.pharmacyId)).size,
      repeatVisits: [...counts.values()].reduce(
        (n, c) => n + Math.max(0, c - 1),
        0
      ),
      revisitedPharmacies: [...counts.values()].filter((c) => c > 1).length,
      assignedPharmacies: assignedIds.size,
      visitedAssigned: personallyCovered.size,
      personalCoveragePct: pct(personallyCovered.size, assignedIds.size),
      servicedAssigned: serviced.size,
      serviceCoveragePct: pct(serviced.size, assignedIds.size),
      unvisitedAssigned: assignedIds.size - serviced.size,
      temporaryAssigned: new Set(activeCoverages.map((c) => c.pharmacy_id))
        .size,
      coverageVisits: completed.filter((v) => v.coverageId).length,
      pharmaciesCoveredByOthers: coveredByOthers.size,
      effectiveSeconds: [...time.values()].reduce(
        (n, r) => n + unionSeconds(r),
        0
      ),
      plannedVisits: planned.length,
      completedPlanned: completedPlanned.length,
      planCompliancePct: pct(completedPlanned.length, planned.length),
      inProgress: records.filter(
        (v) =>
          v.status === 'IN_PROGRESS' &&
          v.checkInAt &&
          !v.checkOutAt &&
          dateMs(v.checkInAt) < midnight(nextDay(b))
      ).length,
      missingTimes: records.filter(
        (v) =>
          v.status === 'DONE' &&
          v.dwellSeconds == null &&
          inRange(v.scheduledDate, a, b)
      ).length,
      longVisits: completed.filter((v) => v.dwellSeconds > 12 * 3600).length,
      notCompleted: records.filter((v) => v.notCompleted && inRange(v.scheduledDate, a, b)).length,
      skipped: records.filter(
        (v) => v.status === 'SKIPPED' && inRange(v.scheduledDate, a, b)
      ).length,
      vacationDays: new Set(
        data.vacations
          .filter((v) => ids.has(v.person_id))
          .flatMap((v) => {
            const days = []
            for (
              let d = v.start_date < a ? a : v.start_date;
              d <= b && d <= v.end_date;
              d = nextDay(d)
            )
              days.push(v.person_id + ':' + d)
            return days
          })
      ).size,
    }
  }
  const personRows = people.map((p) => ({
    ...p,
    ...summarize(ownVisits, [p.id]),
    vacations: data.vacations.filter((v) => v.person_id === p.id),
  }))
  const dailyMap = new Map(),
    personById = new Map(people.map((p) => [p.id, p]))
  function getDay(personId, date) {
    const key = personId + ':' + date
    if (!dailyMap.has(key))
      dailyMap.set(key, {
        personId,
        name: personById.get(personId)?.name,
        date,
        completedVisits: 0,
        firstCheckIn: null,
        lastCheckOut: null,
        vacation: false,
        ranges: [],
      })
    return dailyMap.get(key)
  }
  for (const v of ownVisits) {
    if (!personById.has(v.personId)) continue
    if (inRange(v.enteredDay, start, end)) {
      const d = getDay(v.personId, v.enteredDay)
      if (!d.firstCheckIn || v.checkInAt < d.firstCheckIn)
        d.firstCheckIn = v.checkInAt
    }
    if (inRange(v.completedDay, start, end)) {
      const d = getDay(v.personId, v.completedDay)
      if (!d.lastCheckOut || v.checkOutAt > d.lastCheckOut)
        d.lastCheckOut = v.checkOutAt
      if (v.completed) d.completedVisits++
    }
    if (v.completed) {
      const x = Math.max(dateMs(v.checkInAt), midnight(start)),
        y = Math.min(dateMs(v.checkOutAt), midnight(nextDay(end)))
      if (y > x)
        for (
          let day = localDay(x);
          day <= end && midnight(day) < y;
          day = nextDay(day)
        )
          getDay(v.personId, day).ranges.push([
            Math.max(x, midnight(day)),
            Math.min(y, midnight(nextDay(day))),
          ])
    }
  }
  for (const v of data.vacations) {
    if (!personById.has(v.person_id)) continue
    for (
      let d = v.start_date < start ? start : v.start_date;
      d <= end && d <= v.end_date;
      d = nextDay(d)
    )
      getDay(v.person_id, d).vacation = true
  }
  const daily = [...dailyMap.values()]
    .map(({ ranges, ...d }) => {
      const effectiveSeconds = unionSeconds(ranges)
      return {
        ...d,
        effectiveSeconds,
        overlaps:
          ranges.reduce((n, [a, b]) => n + (b - a) / 1000, 0) >
          effectiveSeconds + 1,
      }
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'es')
    )
  const periods = {}
  for (const kind of ['weekly', 'fortnightly', 'monthly']) {
    const seen = new Set()
    periods[kind] = []
    for (let day = start; day <= end; day = nextDay(day)) {
      const [s, e] = periodBounds(day, kind)
      if (seen.has(s)) continue
      seen.add(s)
      const a = s < start ? start : s,
        b = e > end ? end : e
      periods[kind].push({
        startDate: a,
        endDate: b,
        ...summarize(
          ownVisits,
          people.map((p) => p.id),
          a,
          b
        ),
      })
    }
  }
  const unitMap = new Map()
  const addUnit = (u) => {
    if (!u.pharmacy_id || u.warehouse) return
    if (!unitMap.has(u.pharmacy_id))
      unitMap.set(u.pharmacy_id, {
        id: u.pharmacy_id,
        name: u.unit_name,
        clues: u.clues,
        project: u.project,
        jurisdiction: u.jurisdiction,
        state: u.state,
      })
  }
  data.assignments.forEach(addUnit)
  data.coverages.forEach(addUnit)
  visits
    .filter((v) => v.unitKind === 'PHARMACY')
    .forEach((v) =>
      addUnit({ ...v, pharmacy_id: v.pharmacyId, unit_name: v.name })
    )
  const units = [...unitMap.values()]
    .map((u) => {
      const unitDone = done.filter((v) => v.pharmacyId === u.id),
        unitAssignments = data.assignments.filter(
          (a) => a.pharmacy_id === u.id && assignmentActive(a, start, end)
        )
      const unitCoverages = data.coverages.filter(
        (c) => c.pharmacy_id === u.id && coverageActive(c, start, end)
      )
      return {
        ...u,
        visits: unitDone.length,
        coverageVisits: unitDone.filter((v) => v.coverageId).length,
        lastVisitedAt:
          unitDone
            .map((v) => v.checkOutAt)
            .sort()
            .at(-1) ?? null,
        owners: [
          ...new Set(
            unitAssignments
              .map((a) => data.people.find((p) => p.id === a.person_id)?.name)
              .filter(Boolean)
          ),
        ],
        visitors: [...new Set(unitDone.map((v) => v.personName))],
        temporaryVisitors: [
          ...new Set(unitCoverages.map((c) => c.covering_name)),
        ],
      }
    })
    .sort(
      (a, b) =>
        a.visits - b.visits ||
        String(a.name).localeCompare(String(b.name), 'es')
    )
  const groups = {}
  for (const dimension of ['project', 'jurisdiction']) {
    const keys = new Set(
      [...data.assignments, ...data.coverages]
        .map((a) => a[dimension])
        .concat(ownVisits.map((v) => v[dimension]))
        .filter(Boolean)
    )
    groups[dimension] = [...keys].sort().map((name) => {
      return {
        name,
        ...summarize(
          ownVisits.filter((v) => v[dimension] === name),
          people.map((p) => p.id),
          start,
          end,
          data.assignments.filter((a) => a[dimension] === name),
          data.coverages.filter((a) => a[dimension] === name)
        ),
      }
    })
  }
  groups.coordinator = people
    .filter((p) => p.role === 'COORDINADOR')
    .map((p) => ({
      name: p.name,
      ...summarize(
        ownVisits,
        people
          .filter((s) => s.id === p.id || s.coordinatorIds.includes(p.id))
          .map((s) => s.id)
      ),
    }))
  const offset = (filters.page - 1) * filters.pageSize
  return {
    period: { startDate: start, endDate: end },
    timeZone: REPORT_TIME_ZONE,
    generatedAt: new Date().toISOString(),
    summary: summarize(
      ownVisits,
      people.map((p) => p.id)
    ),
    followUp: buildFollowUp({...data,people},visits,start,end),
    people: personRows,
    groups,
    daily,
    periods,
    units,
    coverages: data.coverages,
    vacations: data.vacations
      .filter((v) => personById.has(v.person_id))
      .map((v) => ({
        ...v,
        name: data.people.find((p) => p.id === v.person_id)?.name,
      })),
    visits: allVisits
      ? visits
      : visits.slice(offset, offset + filters.pageSize),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: visits.length,
    },
    options: {
      people: data.people,
      projects: [
        ...new Set(
          [...data.assignments, ...data.coverages, ...data.visits]
            .map((v) => v.project)
            .filter(Boolean)
        ),
      ].sort(),
      jurisdictions: [
        ...new Set(
          [...data.assignments, ...data.coverages, ...data.visits]
            .map((v) => v.jurisdiction)
            .filter(Boolean)
        ),
      ].sort(),
      states: [
        ...new Set(
          [...data.assignments, ...data.coverages, ...data.visits]
            .map((v) => v.state)
            .filter(Boolean)
        ),
      ].sort(),
    },
  }
}
export function csvCell(value) {
  let text = value == null ? '' : String(value)
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+@\-]/.test(text))
    text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}
export function reportCsv(report, dataset) {
  const headers = {
    pending:['Farmacia','Referencia / CLUES','Proyecto','Jurisdicción','Responsable','Última visita','Días sin visita al cierre','Programación','Vacaciones','Coberturas'],
    planned:['Persona','Programadas','Vigentes','Realizadas al cierre','Realizadas posteriormente','Pendientes','En curso','Omitidas','Canceladas','Reprogramadas','Sin marcas válidas','Adicionales realizadas','Realizadas por cobertura','Planeadas durante vacaciones','Vacaciones'],
    people: [
      'Persona',
      'Rol',
      'Farmacias asignadas',
      'Visitadas personalmente',
      'Cobertura propia %',
      'Atendidas con apoyo',
      'Cobertura servicio %',
      'Visitas finalizadas',
      'Revisitas',
      'Horas en unidades',
      'Días de vacaciones',
    ],
    visits: [
      'Persona',
      'Unidad',
      'CLUES',
      'Proyecto',
      'Jurisdicción',
      'Tipo',
      'Fecha planeada',
      'Hora planeada',
      'Estado',
      'Entrada Guadalajara',
      'Salida Guadalajara',
      'Minutos en unidad',
      'Cobertura temporal',
      'Titular',
      'Observaciones',
    ],
    units: [
      'Unidad',
      'CLUES',
      'Proyecto',
      'Jurisdicción',
      'Titulares en el periodo',
      'Visitas',
      'Visitas por cobertura',
      'Visitantes',
      'Última visita Guadalajara',
    ],
    daily: [
      'Fecha',
      'Persona',
      'Primera entrada Guadalajara',
      'Última salida Guadalajara',
      'Visitas finalizadas',
      'Horas en unidades',
      'Vacaciones',
      'Marcas superpuestas',
    ],
    vacations: ['Persona', 'Inicio autorizado', 'Fin autorizado', 'Estatus'],
    coverages: [
      'Unidad',
      'CLUES',
      'Titular',
      'Persona que cubre',
      'Inicio',
      'Fin',
      'Cancelación Guadalajara',
    ],
  }
  for (const kind of ['weekly', 'fortnightly', 'monthly'])
    headers[kind] = [
      'Inicio del intervalo',
      'Fin del intervalo',
      'Visitas',
      'Farmacias únicas',
      'Revisitas',
      'Cobertura propia %',
      'Cobertura con apoyo %',
      'Horas en unidades',
      'Días-persona de vacaciones',
    ]
  const local = (v) =>
    v
      ? new Intl.DateTimeFormat('es-MX', {
          timeZone: REPORT_TIME_ZONE,
          dateStyle: 'short',
          timeStyle: 'medium',
        }).format(new Date(v))
      : ''
  const rows = {
    pending:()=>report.followUp.pending.map(p=>[p.name,p.clues,p.project,p.jurisdiction,p.personName,local(p.lastVisitedAt),p.daysSinceVisit,p.plannedDates.join(' / '),p.vacations.map(v=>v.startDate+' a '+v.endDate).join(' / '),p.coverages.map(c=>c.name+': '+c.startDate+' a '+c.endDate).join(' / ')]),
    planned:()=>report.followUp.comparison.map(p=>[p.name,p.planned,p.activePlanned,p.completed,p.completedLater,p.pending,p.inProgress,p.omitted,p.cancelled,p.rescheduled,p.missingTimes,p.additional,p.coverageCompleted,p.duringVacation,p.vacations.map(v=>v.startDate+' a '+v.endDate).join(' / ')]),
    people: () =>
      report.people.map((p) => [
        p.name,
        p.role,
        p.assignedPharmacies,
        p.visitedAssigned,
        p.personalCoveragePct,
        p.servicedAssigned,
        p.serviceCoveragePct,
        p.completedVisits,
        p.repeatVisits,
        p.effectiveSeconds / 3600,
        p.vacationDays,
      ]),
    visits: () =>
      report.visits.map((v) => [
        v.personName,
        v.name,
        v.clues,
        v.project,
        v.jurisdiction,
        v.unitKind,
        v.scheduledDate,
        v.scheduledTime,
        v.notCompleted ? 'NO_FINALIZADA' : v.status,
        local(v.checkInAt),
        local(v.checkOutAt),
        v.dwellSeconds == null ? null : v.dwellSeconds / 60,
        v.coverageId ? 'Sí' : 'No',
        v.coverageTitular,
        v.notes,
      ]),
    units: () =>
      report.units.map((u) => [
        u.name,
        u.clues,
        u.project,
        u.jurisdiction,
        u.owners.join(' / '),
        u.visits,
        u.coverageVisits,
        u.visitors.join(' / '),
        local(u.lastVisitedAt),
      ]),
    daily: () =>
      report.daily.map((d) => [
        d.date,
        d.name,
        local(d.firstCheckIn),
        local(d.lastCheckOut),
        d.completedVisits,
        d.effectiveSeconds / 3600,
        d.vacation ? 'Sí' : 'No',
        d.overlaps ? 'Sí' : 'No',
      ]),
    vacations: () =>
      report.vacations.map((v) => [
        v.name,
        v.start_date,
        v.end_date,
        'APPROVED',
      ]),
    coverages: () =>
      report.coverages.map((c) => [
        c.unit_name,
        c.clues,
        c.titular_name,
        c.covering_name,
        c.start_date,
        c.end_date,
        local(c.cancelled_at),
      ]),
  }
  for (const kind of ['weekly', 'fortnightly', 'monthly'])
    rows[kind] = () =>
      report.periods[kind].map((p) => [
        p.startDate,
        p.endDate,
        p.completedVisits,
        p.uniquePharmacies,
        p.repeatVisits,
        p.personalCoveragePct,
        p.serviceCoveragePct,
        p.effectiveSeconds / 3600,
        p.vacationDays,
      ])
  if (
    ![
      'pending','planned',
      'people',
      'visits',
      'units',
      'daily',
      'vacations',
      'coverages',
      'weekly',
      'fortnightly',
      'monthly',
    ].includes(dataset)
  )
    throw fail('El tipo de exportación no es válido.')
  return (
    '\uFEFF' +
    [headers[dataset], ...rows[dataset]()]
      .map((r) => r.map(csvCell).join(','))
      .join('\r\n')
  )
}

export async function reportOptions(db, actor) {
  const people = await reportingPeople(db, actor),
    ids = people.map((p) => p.id)
  const { rows } = await db.query(
    `SELECT DISTINCT f.proyecto AS project,f.region_sanitaria AS jurisdiction,f.estado AS state
    FROM public.farmacia f WHERE EXISTS (SELECT 1 FROM public.pharmacy_supervisor_assignment a WHERE a.pharmacy_id=f.id AND a.supervisor_id=ANY($1::uuid[]))
    OR EXISTS (SELECT 1 FROM public.pharmacy_supervisor_coverage c WHERE c.pharmacy_id=f.id AND (c.covering_supervisor_id=ANY($1::uuid[]) OR c.titular_supervisor_id=ANY($1::uuid[])))
    OR EXISTS (SELECT 1 FROM public.work_plan_item i JOIN public.work_plan p ON p.id=i.plan_id WHERE i.pharmacy_id=f.id AND p.supervisor_id=ANY($1::uuid[]))`,
    [ids]
  )
  const coordinators = new Map()
  for (const p of people) {
    if (p.role === 'COORDINADOR')
      coordinators.set(p.id, { id: p.id, name: p.name })
    for (const c of p.coordinators || []) coordinators.set(c.id, c)
  }
  return {
    people,
    coordinators: [...coordinators.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'es')
    ),
    projects: [...new Set(rows.map((r) => r.project).filter(Boolean))].sort(),
    jurisdictions: [
      ...new Set(rows.map((r) => r.jurisdiction).filter(Boolean)),
    ].sort(),
    states: [...new Set(rows.map((r) => r.state).filter(Boolean))].sort(),
  }
}
