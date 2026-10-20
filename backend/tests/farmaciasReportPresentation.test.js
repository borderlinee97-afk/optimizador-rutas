import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import {
  executionDetails,
  buildReport,
  validateReportFilters,
} from '../services/farmaciasReporting.service.js'
import {
  reportPreset,
  formatPresence,
  formatRecordedAt,
} from '../../src/utils/farmaciasReports.js'
test('web presets use Guadalajara dates across UTC midnight, half-month and year boundaries', () => {
  const now = new Date('2026-10-20T01:00:00Z')
  assert.deepEqual(reportPreset('weekly', now), {
    startDate: '2026-10-19',
    endDate: '2026-10-19',
  })
  assert.deepEqual(reportPreset('fortnightly', now), {
    startDate: '2026-10-16',
    endDate: '2026-10-19',
  })
  assert.deepEqual(reportPreset('monthly', now), {
    startDate: '2026-10-01',
    endDate: '2026-10-19',
  })
  assert.deepEqual(
    reportPreset('previousMonth', new Date('2026-01-01T18:00Z')),
    { startDate: '2025-12-01', endDate: '2025-12-31' }
  )
})
test('execution display does not invent time, preserves zero and shows Guadalajara clock', () => {
  assert.equal(formatPresence(null), '—')
  assert.equal(formatPresence(0), '0 h 00 min')
  assert.equal(formatPresence(5490), '1 h 31 min')
  assert.match(formatRecordedAt('2026-10-20T01:00:00Z'), /19.*oct.*2026.*19:00/)
  assert.equal(
    executionDetails({ status: 'DONE', check_in_at: null, check_out_at: null })
      .dwellSeconds,
    null
  )
  assert.equal(
    executionDetails({
      status: 'DONE',
      check_in_at: '2026-10-19T16:00Z',
      check_out_at: '2026-10-19T15:00Z',
    }).dwellSeconds,
    null
  )
})
test('real web plan mapper exposes actual entry, exit and computed duration without trusting stale dwell totals', () => {
  const source = readFileSync(
    new URL('../routes/web.workPlans.route.js', import.meta.url),
    'utf8'
  )
    .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g, '')
    .replace(/export default router\s*$/, '')
  const context = {
    executionDetails,
    Router: () => ({ use() {}, get() {} }),
    requireAuth() {},
  }
  runInNewContext(source, context)
  const item = context.mapPlanItem({
    id: 'item',
    pharmacy_id: 1,
    status: 'DONE',
    check_in_at: '2026-10-19T15:00Z',
    check_out_at: '2026-10-19T15:30Z',
    dwell_seconds: 999999,
    scheduled_date: '2026-10-19',
  })
  assert.equal(item.dwellSeconds, 1800)
  assert.equal(item.checkInAt, '2026-10-19T15:00:00.000Z')
  assert.equal(item.checkOutAt, '2026-10-19T15:30:00.000Z')
})

test('temporary visit before a permanent assignment is not credited as a titular visit after reassignment', () => {
  const people = ['A', 'B'].map((id) => ({
    id,
    name: id,
    role: 'SUPERVISOR',
    coordinatorIds: [],
    coordinatorNames: [],
  }))
  const unit = {
    pharmacy_id: '1',
    unit_name: 'UNIDAD',
    project: 'JALISCO',
    warehouse: false,
  }
  const report = buildReport(
    {
      people,
      assignments: [
        {
          ...unit,
          person_id: 'B',
          assigned_at: '2026-09-01T06:00Z',
          revoked_at: '2026-10-15T06:00Z',
        },
        {
          ...unit,
          person_id: 'A',
          assigned_at: '2026-10-15T06:00Z',
          revoked_at: null,
        },
      ],
      coverages: [
        {
          ...unit,
          id: 'C',
          titular_supervisor_id: 'B',
          covering_supervisor_id: 'A',
          start_date: '2026-10-10',
          end_date: '2026-10-12',
          approved_at: '2026-10-01T06:00Z',
          cancelled_at: null,
        },
      ],
      vacations: [],
      visits: [
        {
          ...unit,
          id: 'V',
          person_id: 'A',
          person_name: 'A',
          name: 'UNIDAD',
          status: 'DONE',
          source: 'PLAN',
          scheduled_date: '2026-10-11',
          check_in_at: '2026-10-11T15:00Z',
          check_out_at: '2026-10-11T16:00Z',
          activities: [],
        },
      ],
    },
    validateReportFilters({ startDate: '2026-10-01', endDate: '2026-10-31' })
  )
  assert.equal(report.people.find((p) => p.id === 'A').personalCoveragePct, 0)
  assert.equal(report.people.find((p) => p.id === 'B').serviceCoveragePct, 100)
  assert.equal(report.visits[0].coverageId, 'C')
})
