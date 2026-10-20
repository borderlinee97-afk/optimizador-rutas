import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import express from 'express'
import {
  buildReport,
  validateReportFilters,
  midnight,
  localDay,
  csvCell,
} from '../services/farmaciasReporting.service.js'
import { createFarmaciasReportsRouter } from '../routes/web.farmaciasReports.route.js'

const id = () => randomUUID()
const filters = (overrides = {}) =>
  validateReportFilters({
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    ...overrides,
  })
test('report validates real calendar dates, bounded ranges, pagination and identifiers', () => {
  for (const q of [
    { startDate: '2026-02-30' },
    { endDate: '2025-01-01' },
    { endDate: '2028-01-01' },
    { personId: 'x' },
    { page: 0 },
    { pageSize: 201 },
    { pharmacyId: '1 OR 1=1' },
  ])
    assert.throws(() => filters(q), { status: 400 })
  assert.equal(filters().pageSize, 50)
})
test('Mexico midnight and CSV cells preserve operating calendar and reject spreadsheet formulas', () => {
  assert.equal(
    new Date(midnight('2026-10-19')).toISOString(),
    '2026-10-19T06:00:00.000Z'
  )
  assert.equal(
    new Date(midnight('2021-06-01')).toISOString(),
    '2021-06-01T05:00:00.000Z'
  )
  assert.equal(localDay('2026-10-20T01:00:00Z'), '2026-10-19')
  for (const x of ['=1+1', ' +SUM(1)', '\t@SUM(1)', '-cmd'])
    assert.ok(csvCell(x).startsWith('"\''))
  assert.equal(csvCell('Centro "A"'), '"Centro ""A"""')
})
test(
  'report SQL, hierarchy, historical coverage and exports on disposable local PostgreSQL',
  {
    skip: !process.env.TEST_ADMIN_DATABASE_URL,
  },
  async (t) => {
    const url = new URL(process.env.TEST_ADMIN_DATABASE_URL)
    assert.ok(
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname),
      'Local-only test database'
    )
    url.pathname = '/postgres'
    const admin = new Pool({ connectionString: url.toString(), max: 1 })
    const dbName = 'codex_reporting_' + id().replaceAll('-', '').slice(0, 12)
    let db,
      server,
      created = false
    const manager = id(),
      jcoord = id(),
      pcoord1 = id(),
      pcoord2 = id(),
      a = id(),
      b = id(),
      ps = id(),
      otherManager = id(),
      other = id(),
      inactive = id()
    const auth = new Map()
    try {
      await admin.query(`CREATE DATABASE "${dbName}"`)
      created = true
      url.pathname = '/' + dbName
      db = new Pool({ connectionString: url.toString(), max: 4 })
      await db.query(`CREATE TABLE personas(id uuid PRIMARY KEY,nombre text,area text,rol text,activo boolean DEFAULT true,superior_id uuid,auth_user_id uuid,system_role text DEFAULT 'USER');
      CREATE TABLE person_state_scope(persona_id uuid,estado text,revoked_at timestamptz);
      CREATE TABLE puebla_supervisor_coordinator(coordinator_id uuid,supervisor_id uuid,revoked_at timestamptz);
      CREATE TABLE farmacia(id bigint PRIMARY KEY,clues text,unidad text,proyecto text,region_sanitaria text,estado text,lugar_farmacia text);
      CREATE TABLE pharmacy_shared_plan_access(pharmacy_id bigint);
      CREATE TABLE pharmacy_supervisor_assignment(id uuid DEFAULT gen_random_uuid(),pharmacy_id bigint,supervisor_id uuid,assigned_at timestamptz,revoked_at timestamptz);
      CREATE TABLE pharmacy_supervisor_coverage(id uuid PRIMARY KEY,pharmacy_id bigint,coordinator_id uuid,titular_supervisor_id uuid,covering_supervisor_id uuid,start_date date,end_date date,status text,reviewed_at timestamptz,requested_at timestamptz,cancelled_at timestamptz);
      CREATE TABLE person_availability_request(id uuid PRIMARY KEY,supervisor_id uuid,start_date date,end_date date,status text);
      CREATE TABLE work_plan(id uuid PRIMARY KEY,supervisor_id uuid,status text,plan_type text,approved_at timestamptz);
      CREATE TABLE work_plan_item(id uuid PRIMARY KEY,plan_id uuid,pharmacy_id bigint,custom_name text,item_type text,source text,status text,scheduled_date date,scheduled_time time,check_in_at timestamptz,check_out_at timestamptz,dwell_seconds int,notes text,skip_reason text,reschedule_reason text,removed_at timestamptz);
      CREATE TABLE pharmacy_activity(id uuid PRIMARY KEY,plan_item_id uuid,activity_type text,status text,completed_at timestamptz,execution_note text,skip_reason text,ord int,note text,completed_by uuid,skipped_by uuid,skipped_at timestamptz,created_by uuid,created_at timestamptz DEFAULT now(),updated_by uuid,updated_at timestamptz);`)
      const migration = await readFile(
        new URL(
          '../../supabase/migrations/20261018120000_puebla_shared_reporting_availability.sql',
          import.meta.url
        ),
        'utf8'
      )
      await db.query(
        migration.match(
          /CREATE FUNCTION public\.puebla_shared_supervisor[\s\S]*?\$\$;/
        )[0]
      )
      for (const [person, name, role, parent, active] of [
        [manager, 'GERENCIA', 'GERENTE', null, true],
        [jcoord, 'COORD JALISCO', 'COORDINADOR', manager, true],
        [pcoord1, 'COORD PUEBLA 1', 'COORDINADOR', manager, true],
        [pcoord2, 'COORD PUEBLA 2', 'COORDINADOR', manager, true],
        [a, 'SUPERVISOR A', 'SUPERVISOR', jcoord, true],
        [b, 'SUPERVISOR B', 'SUPERVISOR', jcoord, true],
        [ps, 'SUPERVISOR P', 'SUPERVISOR', pcoord1, true],
        [otherManager, 'GERENCIA AJENA', 'GERENTE', null, true],
        [other, 'SUPERVISOR EXTERNO', 'SUPERVISOR', otherManager, true],
        [inactive, 'INACTIVO', 'GERENTE', null, false],
      ]) {
        const user = id()
        auth.set(person, user)
        await db.query(
          "INSERT INTO personas VALUES($1,$2,'FARMACIAS',$3,$4,$5,$6,'USER')",
          [person, name, role, active, parent, user]
        )
      }
      for (const p of [pcoord1, pcoord2, ps])
        await db.query(
          "INSERT INTO person_state_scope VALUES($1,'Puebla',NULL)",
          [p]
        )
      for (const c of [pcoord1, pcoord2])
        await db.query(
          'INSERT INTO puebla_supervisor_coordinator VALUES($1,$2,NULL)',
          [c, ps]
        )
      for (const [unit, project, kind] of [
        [1, 'JALISCO', 'FARMACIAS'],
        [2, 'JALISCO', 'FARMACIAS'],
        [3, 'JALISCO', 'FARMACIAS'],
        [4, 'JALISCO', 'FARMACIAS'],
        [5, 'PUEBLA', 'FARMACIAS'],
        [6, 'JALISCO', 'ALMACENES'],
        [9, 'AJENO', 'FARMACIAS'],
      ]) {
        await db.query(
          "INSERT INTO farmacia VALUES($1,$2,$3,$4,'JURISDICCIÓN 1',$4,$5)",
          [unit, 'CLUES-' + unit, 'UNIDAD ' + unit, project, kind]
        )
      }
      await db.query(`INSERT INTO pharmacy_shared_plan_access VALUES(6);
      INSERT INTO pharmacy_supervisor_assignment(pharmacy_id,supervisor_id,assigned_at,revoked_at) VALUES
      (1,'${a}','2026-09-01T06:00Z','2026-10-15T18:00Z'),(2,'${a}','2026-09-01T06:00Z',NULL),(3,'${a}','2026-09-01T06:00Z',NULL),
      (4,'${b}','2026-09-01T06:00Z',NULL),(5,'${ps}','2026-09-01T06:00Z',NULL),(6,'${a}','2026-09-01T06:00Z',NULL),(9,'${other}','2026-09-01T06:00Z',NULL)`)
      const cov1 = id(),
        cov2 = id(),
        cancelled = id()
      for (const [
        cid,
        unit,
        titular,
        coverer,
        start,
        end,
        status,
        cancelAt,
      ] of [
        [cov1, 3, a, other, '2026-10-10', '2026-10-12', 'APPROVED', null],
        [cov2, 5, ps, a, '2026-10-10', '2026-10-12', 'APPROVED', null],
        [
          cancelled,
          3,
          a,
          other,
          '2026-10-13',
          '2026-10-18',
          'CANCELLED',
          '2026-10-15T18:00Z',
        ],
      ]) {
        await db.query(
          "INSERT INTO pharmacy_supervisor_coverage VALUES($1,$2,$3,$4,$5,$6,$7,$8,'2026-10-01T06:00Z','2026-10-01T06:00Z',$9)",
          [cid, unit, jcoord, titular, coverer, start, end, status, cancelAt]
        )
      }
      await db.query(
        "INSERT INTO person_availability_request VALUES($1,$2,'2026-10-03','2026-10-05','APPROVED'),($3,$2,'2026-10-06','2026-10-07','PENDING_APPROVAL')",
        [id(), b, id()]
      )
      const plans = new Map()
      for (const p of [a, b, ps, other]) {
        const plan = id()
        plans.set(p, plan)
        await db.query(
          "INSERT INTO work_plan VALUES($1,$2,'APPROVED','ORDINARY','2026-09-28T12:00Z')",
          [plan, p]
        )
      }
      async function visit(
        person,
        unit,
        date,
        from,
        to,
        { status = 'DONE', source = 'PLAN', custom = null } = {}
      ) {
        const vid = id()
        await db.query(
          `INSERT INTO work_plan_item(id,plan_id,pharmacy_id,custom_name,item_type,source,status,scheduled_date,check_in_at,check_out_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            vid,
            plans.get(person),
            unit,
            custom,
            unit ? 'PHARMACY' : 'EXTRA_STOP',
            source,
            status,
            date,
            from,
            to,
          ]
        )
        return vid
      }
      const first = await visit(
        a,
        1,
        '2026-10-02',
        '2026-10-02T15:00Z',
        '2026-10-02T16:00Z'
      )
      await visit(a, 1, '2026-10-08', '2026-10-08T15:00Z', '2026-10-08T16:00Z')
      await visit(a, 2, '2026-10-08', '2026-10-08T15:30Z', '2026-10-08T16:30Z')
      await visit(a, 6, '2026-10-08', '2026-10-08T17:00Z', '2026-10-08T17:15Z')
      await visit(
        a,
        null,
        '2026-10-08',
        '2026-10-08T18:00Z',
        '2026-10-08T18:10Z',
        { source: 'SUPERVISOR_ADHOC', custom: 'Actividad administrativa' }
      )
      await visit(a, 2, '2026-10-19', '2026-10-19T15:00Z', null, {
        status: 'IN_PROGRESS',
      })
      await visit(a, 1, '2026-10-09', null, null)
      await visit(a, 2, '2026-10-31', '2026-11-01T05:30Z', '2026-11-01T06:30Z')
      await visit(
        other,
        3,
        '2026-10-11',
        '2026-10-11T15:00Z',
        '2026-10-11T16:00Z'
      )
      await visit(
        other,
        3,
        '2026-10-14',
        '2026-10-14T15:00Z',
        '2026-10-14T16:00Z'
      )
      await visit(
        other,
        3,
        '2026-10-16',
        '2026-10-16T15:00Z',
        '2026-10-16T16:00Z'
      )
      await visit(
        other,
        9,
        '2026-10-11',
        '2026-10-11T15:00Z',
        '2026-10-11T16:00Z'
      )
      await visit(a, 5, '2026-10-11', '2026-10-11T15:00Z', '2026-10-11T16:00Z')
      await db.query(
        "INSERT INTO pharmacy_activity(id,plan_item_id,activity_type,status,completed_at,execution_note,skip_reason,ord) VALUES($1,$2,'Verificación','DONE','2026-10-02T15:30Z','Revisión completada',NULL,1)",
        [id(), first]
      )
      const draft = id()
      await db.query(
        "INSERT INTO work_plan VALUES($1,$2,'DRAFT','ORDINARY',NULL)",
        [draft, a]
      )
      await db.query(
        "INSERT INTO work_plan_item(id,plan_id,pharmacy_id,item_type,source,status,scheduled_date)VALUES($1,$2,1,'PHARMACY','PLAN','DONE','2026-10-05')",
        [id(), draft]
      )
      const app = express()
      app.use(
        '/reports',
        createFarmaciasReportsRouter(db, (req, res, next) => {
          if (!req.headers['x-test-user'])
            return res.status(401).json({ error: 'auth' })
          req.auth = { user: { id: req.headers['x-test-user'] } }
          next()
        })
      )
      server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s))
      })
      async function request(person, query = {}, path = '') {
        const qs = new URLSearchParams({
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          ...query,
        })
        const response = await fetch(
          `http://127.0.0.1:${server.address().port}/reports${path}?${qs}`,
          { headers: person ? { 'x-test-user': auth.get(person) } : {} }
        )
        return { status: response.status, body: await response.json() }
      }
      await t.test(
        'permission gates reject anonymous, inactive, supervisor and other-team filters',
        async () => {
          assert.equal((await request(null)).status, 401)
          assert.equal((await request(a)).status, 403)
          assert.equal((await request(inactive)).status, 403)
          assert.equal(
            (await request(manager, { personId: other })).status,
            403
          )
          assert.equal(
            (await request(manager, { pharmacyId: '9' })).status,
            404
          )
          assert.equal(
            (await request(manager, { startDate: '2026-02-30' })).status,
            400
          )
          assert.equal(
            (await request(manager, { dataset: '__proto__' }, '/export'))
              .status,
            400
          )
        }
      )
      await t.test(
        'own coverage, temporary support, separate warehouses, revisits, vacation and overlapped time reconcile',
        async () => {
          const r = await request(manager, { personId: a })
          assert.equal(r.status, 200)
          const s = r.body.summary
          assert.equal(s.assignedPharmacies, 3)
          assert.equal(s.visitedAssigned, 2)
          assert.equal(s.personalCoveragePct, 66.7)
          assert.equal(s.serviceCoveragePct, 100)
          assert.equal(s.temporaryAssigned, 1)
          assert.equal(s.coverageVisits, 1)
          assert.equal(s.completedVisits, 6)
          assert.equal(s.pharmacyVisits, 4)
          assert.equal(s.warehouseVisits, 1)
          assert.equal(s.extraStops, 1)
          assert.equal(s.repeatVisits, 1)
          assert.equal(s.missingTimes, 1)
          assert.equal(s.inProgress, 1)
          assert.equal(
            r.body.visits.find((v) => v.id === first).activities[0].name,
            'Verificación'
          )
          assert.equal(s.effectiveSeconds, 15900) // 1h + 1.5h + .25h + 10min + 1h + .5h overnight.
          assert.equal(
            r.body.daily.find((d) => d.date === '2026-10-08').effectiveSeconds,
            6900
          )
          assert.equal(
            r.body.daily.find((d) => d.date === '2026-10-08').overlaps,
            true
          )
          const unit = r.body.units.find((u) => u.id === '3')
          assert.equal(unit.visits, 2)
          assert.equal(unit.coverageVisits, 2)
          assert.ok(!r.body.visits.some((v) => v.pharmacyId === '9'))
          assert.equal(
            r.body.visits.filter((v) => v.personId === other).length,
            2
          )
          const vac = await request(manager, { personId: b })
          assert.equal(vac.body.summary.completedVisits, 0)
          assert.equal(vac.body.summary.vacationDays, 3)
          assert.equal(vac.body.vacations.length, 1)
          assert.equal(vac.body.daily.filter((d) => d.vacation).length, 3)
        }
      )
      await t.test(
        'Puebla shared coordinators each see the same supervisor without multiplying general totals',
        async () => {
          const r1 = await request(pcoord1),
            r2 = await request(pcoord2),
            all = await request(manager)
          for (const r of [r1, r2]) {
            assert.equal(r.status, 200)
            assert.ok(r.body.people.some((p) => p.id === ps))
            assert.ok(!r.body.people.some((p) => p.id === a))
            assert.equal(r.body.summary.serviceCoveragePct, 100)
            assert.equal(r.body.summary.personalCoveragePct, 0)
          }
          assert.equal(all.body.people.filter((p) => p.id === ps).length, 1)
          assert.equal(all.body.summary.completedVisits, 6)
        }
      )
      await t.test(
        'midnight splits time and credits a completed visit to the exit date; territorial filters and unit history stay scoped',
        async () => {
          const october = await request(manager, { personId: a })
          const last = october.body.daily.find((d) => d.date === '2026-10-31')
          assert.equal(last.effectiveSeconds, 1800)
          assert.equal(last.completedVisits, 0)
          const november = await request(manager, {
            personId: a,
            startDate: '2026-11-01',
            endDate: '2026-11-01',
          })
          assert.equal(november.body.summary.completedVisits, 1)
          assert.equal(november.body.summary.effectiveSeconds, 1800)
          const puebla = await request(manager, { project: 'PUEBLA' })
          assert.equal(puebla.body.summary.completedVisits, 1)
          assert.equal(puebla.body.vacations.length, 0)
          assert.ok(puebla.body.units.every((u) => u.project === 'PUEBLA'))
          const history = await request(manager, { pharmacyId: '3' })
          assert.equal(history.body.visits.length, 2)
          assert.ok(history.body.visits.every((v) => v.coverageId))
          assert.ok(
            history.body.visits.every(
              (v) => v.personName === 'SUPERVISOR EXTERNO'
            )
          )
          const options = await request(pcoord2, {}, '/options')
          assert.ok(options.body.people.some((p) => p.id === ps))
          assert.ok(!options.body.projects.includes('AJENO'))
        }
      )
      await t.test(
        'periods, pagination and all exports reconcile with unchanged metrics',
        async () => {
          const r = await request(manager),
            paged = await request(manager, { pageSize: '2' })
          assert.equal(paged.body.visits.length, 2)
          assert.equal(
            paged.body.summary.completedVisits,
            r.body.summary.completedVisits
          )
          for (const key of ['weekly', 'fortnightly', 'monthly']) {
            assert.equal(
              r.body.periods[key].reduce((s, p) => s + p.completedVisits, 0),
              r.body.summary.completedVisits
            )
            assert.equal(
              r.body.periods[key].reduce((s, p) => s + p.effectiveSeconds, 0),
              r.body.summary.effectiveSeconds
            )
          }
          for (const dataset of [
            'people',
            'visits',
            'units',
            'daily',
            'coverages',
            'vacations',
            'weekly',
            'fortnightly',
            'monthly',
          ]) {
            const csv = await request(manager, { dataset }, '/export')
            assert.equal(csv.status, 200)
            assert.ok(csv.body.csv.startsWith('\uFEFF'))
            assert.match(csv.body.filename, /\.csv$/)
          }
        }
      )
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      if (db) await db.end()
      if (created) await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`)
      await admin.end()
    }
  }
)
