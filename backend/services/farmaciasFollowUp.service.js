// Follow-up uses the same authorized snapshots and actual timestamps as reports.
const ms = (v) => (v == null ? Infinity : new Date(v).getTime())
const day = (v) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
    new Date(v)
  )
export function buildFollowUp(data, visits, start, end) {
  const vacation = (person, date) =>
    data.vacations.some(
      (v) =>
        v.person_id === person && v.start_date <= date && v.end_date >= date
    )
  const completed = (v) =>
    v.completed && v.completedDay >= start && v.completedDay <= end
  const assignments = data.assignments.filter((a) => !a.warehouse)
  const atAssignment = (v, a) =>
    v.pharmacyId === a.pharmacy_id &&
    ms(v.checkInAt) >= ms(a.assigned_at) &&
    ms(v.checkInAt) < ms(a.revoked_at)
  const covered = (v, a) =>
    v.coverageId &&
    data.coverages.some(
      (c) => c.id === v.coverageId && c.titular_supervisor_id === a.person_id
    )
  const pending = []
  const seen = new Set()
  for (const a of assignments) {
    const key = a.person_id + ':' + a.pharmacy_id
    if (seen.has(key)) continue
    seen.add(key)
    const same = assignments.filter(
      (x) => x.person_id === a.person_id && x.pharmacy_id === a.pharmacy_id
    )
    if (
      visits.some(
        (v) =>
          completed(v) &&
          same.some(
            (x) =>
              atAssignment(v, x) &&
              (v.personId === x.person_id || covered(v, x))
          )
      )
    )
      continue
    const owner = data.people.find((p) => p.id === a.person_id)
    const coverage = data.coverages.filter(
      (c) =>
        c.pharmacy_id === a.pharmacy_id &&
        c.titular_supervisor_id === a.person_id
    )
    const vacations = data.vacations.filter((v) => v.person_id === a.person_id)
    const last =
      (data.lastVisits || []).find((v) => v.pharmacy_id === a.pharmacy_id)
        ?.last_visit_at || null
    pending.push({
      id: key,
      pharmacyId: a.pharmacy_id,
      name: a.unit_name,
      clues: a.clues,
      project: a.project,
      jurisdiction: a.jurisdiction,
      personId: a.person_id,
      personName: owner?.name,
      assignedFrom: day(a.assigned_at),
      lastVisitedAt: last,
      daysSinceVisit: last
        ? Math.max(
            0,
            Math.round((Date.parse(end) - Date.parse(day(last))) / 86400000)
          )
        : null,
      vacations: vacations.map((v) => ({
        startDate: v.start_date,
        endDate: v.end_date,
      })),
      coverages: coverage.map((c) => ({
        name: c.covering_name,
        startDate: c.start_date,
        endDate: c.end_date,
      })),
      plannedDates: [
        ...new Set(
          visits
            .filter(
              (v) =>
                v.pharmacyId === a.pharmacy_id &&
                v.personId === a.person_id &&
                v.source === 'PLAN' &&
                v.scheduledDate >= start &&
                v.scheduledDate <= end &&
                !['CANCELLED', 'RESCHEDULED'].includes(v.status)
            )
            .map((v) => v.scheduledDate)
        ),
      ],
    })
  }
  pending.sort(
    (a, b) =>
      (b.daysSinceVisit ?? Infinity) - (a.daysSinceVisit ?? Infinity) ||
      String(a.name).localeCompare(String(b.name), 'es')
  )
  const comparison = data.people.map((p) => {
    const rows = visits.filter(
      (v) => v.personId === p.id && !v.externalCoverage
    )
    const planned = rows.filter(
      (v) =>
        v.source === 'PLAN' &&
        v.scheduledDate >= start &&
        v.scheduledDate <= end
    )
    const active = planned.filter(
      (v) => !['CANCELLED', 'RESCHEDULED'].includes(v.status)
    )
    const done = (v) => v.completed && v.completedDay <= end
    return {
      personId: p.id,
      name: p.name,
      planned: planned.length,
      activePlanned: active.length,
      completed: active.filter(done).length,
      completedLater: active.filter((v) => v.completed && v.completedDay > end)
        .length,
      pending: active.filter((v) => v.status === 'PENDING').length,
      inProgress: active.filter((v) => v.status === 'IN_PROGRESS').length,
      omitted: active.filter((v) => v.status === 'SKIPPED').length,
      cancelled: planned.filter((v) => v.status === 'CANCELLED').length,
      rescheduled: planned.filter((v) => v.status === 'RESCHEDULED').length,
      missingTimes: active.filter((v) => v.status === 'DONE' && !v.completed)
        .length,
      additional: rows.filter((v) => v.source !== 'PLAN' && completed(v))
        .length,
      duringVacation: active.filter((v) => vacation(p.id, v.scheduledDate))
        .length,
      coverageCompleted: rows.filter((v) => v.coverageId && completed(v))
        .length,
      vacations: data.vacations
        .filter((v) => v.person_id === p.id)
        .map((v) => ({ startDate: v.start_date, endDate: v.end_date })),
      incidents: planned
        .filter((v) =>
          ['SKIPPED', 'CANCELLED', 'RESCHEDULED'].includes(v.status)
        )
        .map((v) => ({
          name: v.name,
          date: v.scheduledDate,
          status: v.status,
          reason:
            v.skipReason ||
            v.rescheduleReason ||
            v.cancellationNotes ||
            v.notes ||
            'Sin motivo registrado',
        })),
    }
  })
  return { pending, comparison }
}
