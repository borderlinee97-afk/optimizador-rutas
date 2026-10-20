import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { buildFollowUp } from '../services/farmaciasFollowUp.service.js'
import { cancelRemainingVisits } from '../services/workPlanBulkCancellation.service.js'
import {
  listAvailability,
  createAvailability,
  reviewAvailability,
} from '../services/personAvailability.service.js'
import {
  queuePlanNotifications,
  queueTaskAssignment,
  queueDueTaskReminders,
  dispatchPlanNotifications,
  PUSH_PROJECT_ID,
} from '../services/planNotifications.service.js'
import { createPasswordAccess } from '../../src/services/passwordAccess.js'

test('follow-up credits temporary service, preserves assignment intervals and vacation context', () => {
  const data = {
    people: [
      { id: 'a', name: 'Titular' },
      { id: 'b', name: 'Apoyo' },
    ],
    assignments: [
      {
        person_id: 'a',
        pharmacy_id: '1',
        unit_name: 'Atendida',
        assigned_at: '2026-10-01T06:00Z',
        revoked_at: null,
      },
      {
        person_id: 'a',
        pharmacy_id: '2',
        unit_name: 'Pendiente',
        assigned_at: '2026-10-01T06:00Z',
        revoked_at: null,
      },
      {
        person_id: 'a',
        pharmacy_id: '3',
        warehouse: true,
        assigned_at: '2026-10-01T06:00Z',
      },
    ],
    coverages: [
      {
        id: 'c',
        pharmacy_id: '1',
        titular_supervisor_id: 'a',
        covering_supervisor_id: 'b',
        covering_name: 'Apoyo',
        start_date: '2026-10-02',
        end_date: '2026-10-12',
      },
    ],
    vacations: [
      { person_id: 'a', start_date: '2026-10-05', end_date: '2026-10-09' },
    ],
    lastVisits: [{ pharmacy_id: '2', last_visit_at: '2026-09-28T20:00Z' }],
  }
  const v = {
    id: 'v',
    pharmacyId: '1',
    personId: 'b',
    completed: true,
    completedDay: '2026-10-08',
    checkInAt: '2026-10-08T16:00Z',
    coverageId: 'c',
    source: 'PLAN',
    scheduledDate: '2026-10-08',
    status: 'DONE',
  }
  const r = buildFollowUp(
    data,
    [
      v,
      {
        ...v,
        id: 'w',
        pharmacyId: '2',
        personId: 'a',
        completed: false,
        coverageId: null,
        status: 'PENDING',
      },
    ],
    '2026-10-01',
    '2026-10-31'
  )
  assert.equal(r.pending.length, 1)
  assert.equal(r.pending[0].pharmacyId, '2')
  assert.equal(r.pending[0].daysSinceVisit, 33)
  assert.equal(r.pending[0].vacations.length, 1)
  assert.equal(r.comparison[0].duringVacation, 1)
  assert.equal(r.comparison[1].coverageCompleted, 1)
  const early = buildFollowUp(
    {
      ...data,
      assignments: [
        { ...data.assignments[0], assigned_at: '2026-10-15T06:00Z' },
      ],
    },
    [v],
    '2026-10-01',
    '2026-10-31'
  )
  assert.equal(early.pending.length, 1)
})

test('password flow uses Supabase recovery, verifies current password and never updates on invalid input', async () => {
  const calls = []
  const auth = {
    async resetPasswordForEmail(...a) {
      calls.push(['request', ...a])
      return {}
    },
    async getUser() {
      return { data: { user: { id: 'self', email: 'self@example.test' } } }
    },
    async signInWithPassword(x) {
      calls.push(['verify', x])
      return x.password === 'correct' ? {} : { error: new Error('bad') }
    },
    async updateUser(x) {
      calls.push(['update', x])
      return {}
    },
  }
  const s = createPasswordAccess(auth)
  await s.request(' Self@Example.test ', 'https://routes.example.test')
  assert.equal(calls[0][1], 'self@example.test')
  assert.equal(
    calls[0][2].redirectTo,
    'https://routes.example.test/?password=recovery'
  )
  await assert.rejects(s.update({ value: 'short', confirmation: 'short' }))
  await assert.rejects(
    s.update({ value: 'new-long-password', confirmation: 'different' })
  )
  assert.equal(calls.length, 1)
  await assert.rejects(
    s.update({
      value: 'new-long-password',
      confirmation: 'new-long-password',
      currentPassword: 'bad',
    })
  )
  assert.equal(calls.filter((c) => c[0] === 'update').length, 0)
  await s.update({
    value: 'new-long-password',
    confirmation: 'new-long-password',
    currentPassword: 'correct',
  })
  assert.equal(calls.at(-1)[0], 'update')
  await s.update({
    value: 'recovery-password',
    confirmation: 'recovery-password',
    recovery: true,
  })
  assert.equal(calls.at(-1)[1].password, 'recovery-password')
  await assert.rejects(
    createPasswordAccess({
      ...auth,
      async getUser() {
        return { error: new Error('expired') }
      },
    }).update({
      value: 'new-long-password',
      confirmation: 'new-long-password',
      recovery: true,
    })
  )
})

test(
  'vacations, bulk cancellations and agenda delivery on disposable PostgreSQL',
  { skip: !process.env.TEST_ADMIN_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.TEST_ADMIN_DATABASE_URL)
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(url.hostname))
    url.pathname = '/postgres'
    const admin = new Pool({ connectionString: url.toString(), max: 1 }),
      name = 'codex_followup_' + randomUUID().replaceAll('-', '').slice(0, 12)
    let db,
      created = false
    const ids = Object.fromEntries(
      [
        'manager',
        'coord',
        'coord2',
        'pcoord1',
        'pcoord2',
        'puebla',
        'supervisor',
        'other',
        'auth',
      ].map((k) => [k, randomUUID()])
    )
    const actor = (k) => ({
      id: ids[k],
      area: 'FARMACIAS',
      activo: true,
      rol:
        k === 'manager'
          ? 'GERENTE'
          : k.includes('coord')
            ? 'COORDINADOR'
            : 'SUPERVISOR',
    })
    const schema = await readFile(
      new URL(
        '../../supabase/migrations/20260917181330_remote_schema.sql',
        import.meta.url
      ),
      'utf8'
    )
    const migration = async (file) =>
      (
        await readFile(
          new URL('../../supabase/migrations/' + file, import.meta.url),
          'utf8'
        )
      ).replace(/^(?:GRANT|REVOKE)[^;]*;/gm, '')
    try {
      await admin.query('CREATE DATABASE "' + name + '"')
      created = true
      url.pathname = '/' + name
      db = new Pool({ connectionString: url.toString(), max: 4 })
      await db.query(
        `CREATE TABLE personas(id uuid PRIMARY KEY,nombre text,area text,rol text,activo boolean DEFAULT true,auth_user_id uuid,superior_id uuid,estado text,system_role text DEFAULT 'USER');CREATE TABLE person_state_scope(persona_id uuid,estado text,revoked_at timestamptz);`
      )
      await db.query('CREATE SEQUENCE public.farmacia_id_seq')
      for (const table of [
        'farmacia',
        'pharmacy_supervisor_assignment',
        'pharmacy_assignment_event',
        'work_plan',
        'work_plan_item',
        'work_plan_event',
      ]) {
        const m = schema.match(
          new RegExp(
            'CREATE TABLE "public"\\."' + table + '" \\([\\s\\S]*?\\n\\);'
          )
        )
        if (!m) throw Error(table)
        await db.query(m[0].replaceAll('public.geometry(Point,4326)', 'text'))
      }
      await db.query(
        await migration('20260917182800_work_plan_item_execution.sql')
      )
      await db.query(
        await migration(
          '20261018120000_puebla_shared_reporting_availability.sql'
        )
      )
      await db.query(
        await migration('20261019140000_plan_approvals_notifications.sql')
      )
      const op = await migration(
        '20260917183000_pilot_evidence_tasks_director.sql'
      )
      await db.query(
        op.match(/CREATE TABLE public\.operational_task \([\s\S]*?\n\);/)[0]
      )
      await db.query(
        await migration('20261020120000_task_push_notifications.sql')
      )
      // Match the existing production cancellation constraint, retaining source/status protections.
      await db.query(
        `ALTER TABLE work_plan_item DROP CONSTRAINT work_plan_item_cancellation_check;ALTER TABLE work_plan_item ADD CHECK(status<>'CANCELLED' OR (cancellation_request_status='APPROVED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reviewed_at IS NOT NULL AND cancellation_reviewed_by IS NOT NULL));`
      )
      for (const key of Object.keys(ids).filter((k) => k !== 'auth'))
        await db.query(
          `INSERT INTO personas(id,nombre,area,rol,superior_id,auth_user_id,estado) VALUES($1,$2,'FARMACIAS',$3,$4,$5,$6)`,
          [
            ids[key],
            key,
            actor(key).rol,
            key === 'supervisor'
              ? ids.coord
              : key === 'puebla'
                ? ids.pcoord1
                : key.includes('coord')
                  ? ids.manager
                  : null,
            key === 'supervisor' ? ids.auth : randomUUID(),
            key === 'puebla' || key.startsWith('pcoord') ? 'Puebla' : 'Jalisco',
          ]
        )
      for (const k of ['pcoord1', 'pcoord2', 'puebla'])
        await db.query(
          "INSERT INTO person_state_scope VALUES($1,'Puebla',NULL)",
          [ids[k]]
        )
      for (const k of ['pcoord1', 'pcoord2'])
        await db.query(
          'INSERT INTO puebla_supervisor_coordinator(coordinator_id,supervisor_id) VALUES($1,$2)',
          [ids[k], ids.puebla]
        )
      await t.test(
        'normal hierarchy and Puebla-only shared vacations; overlaps and retry are safe',
        async () => {
          const input = {
            id: randomUUID(),
            startDate: '2026-11-02',
            endDate: '2026-11-06',
            comment: 'Vacaciones de prueba',
          }
          const r = await createAvailability(actor('supervisor'), input, db)
          assert.equal(r.status, 'PENDING_APPROVAL')
          assert.equal(
            (await createAvailability(actor('supervisor'), input, db)).id,
            r.id
          )
          await assert.rejects(
            createAvailability(
              actor('supervisor'),
              { ...input, id: randomUUID() },
              db
            ),
            (e) => e.status === 409
          )
          assert.equal(
            (await listAvailability(actor('coord'), db)).requests.length,
            1
          )
          assert.equal(
            (await listAvailability(actor('coord2'), db)).requests.length,
            0
          )
          await assert.rejects(
            reviewAvailability(actor('coord2'), r.id, 'APPROVED', '', db),
            (e) => e.status === 404
          )
          await reviewAvailability(actor('coord'), r.id, 'APPROVED', '', db)
          await assert.rejects(
            reviewAvailability(
              actor('manager'),
              r.id,
              'REJECTED',
              'Motivo de prueba',
              db
            ),
            (e) => e.status === 409
          )
          const p = await createAvailability(
            actor('puebla'),
            { ...input, id: randomUUID() },
            db
          )
          await reviewAvailability(actor('pcoord2'), p.id, 'APPROVED', '', db)
          await assert.rejects(
            createAvailability(
              actor('supervisor'),
              { ...input, startDate: '2026-02-30' },
              db
            ),
            (e) => e.status === 400
          )
        }
      )
      await t.test(
        'bulk request preserves completed and in-progress visits; scoped reviewer cancels remaining',
        async () => {
          const plan = randomUUID()
          await db.query(
            "INSERT INTO work_plan(id,supervisor_id,status,created_by,week_start,period_start,period_end) VALUES($1,$2,'APPROVED',$2,'2026-11-02','2026-11-02','2026-11-08')",
            [plan, ids.supervisor]
          )
          const items = []
          for (const status of ['PENDING', 'PENDING', 'DONE', 'IN_PROGRESS']) {
            const id = randomUUID()
            items.push(id)
            await db.query(
              "INSERT INTO work_plan_item(id,plan_id,item_type,source,status,scheduled_date,ord,check_in_at) VALUES($1,$2,'PHARMACY','PLAN',$3,'2026-11-02',1,CASE WHEN $3='IN_PROGRESS' THEN now() ELSE NULL END)",
              [id, plan, status]
            )
          }
          await assert.rejects(
            cancelRemainingVisits(
              actor('other'),
              plan,
              { reason: 'Prueba fuera de ámbito', confirm: true },
              db
            ),
            (e) => e.status === 404
          )
          const r = await cancelRemainingVisits(
            actor('supervisor'),
            plan,
            { reason: 'Vacaciones autorizadas', confirm: true },
            db
          )
          assert.equal(r.count, 2)
          assert.equal(r.mode, 'PENDING_APPROVAL')
          assert.equal(
            (
              await cancelRemainingVisits(
                actor('supervisor'),
                plan,
                { reason: 'Vacaciones autorizadas', confirm: true },
                db
              )
            ).count,
            0
          )
          assert.deepEqual(
            (
              await db.query(
                'SELECT status FROM work_plan_item WHERE id=ANY($1::uuid[]) ORDER BY status',
                [items.slice(2)]
              )
            ).rows.map((r) => r.status),
            ['DONE', 'IN_PROGRESS']
          )
          await db.query(
            "UPDATE work_plan_item SET cancellation_request_status=NULL WHERE plan_id=$1 AND status='PENDING'",
            [plan]
          )
          const c = await cancelRemainingVisits(
            actor('coord'),
            plan,
            { reason: 'Cancelación de prueba por superior', confirm: true },
            db
          )
          assert.equal(c.mode, 'CANCELLED')
          assert.equal(c.count, 2)
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int AS n FROM work_plan_event WHERE plan_id=$1',
                [plan]
              )
            ).rows[0].n,
            4
          )
        }
      )
      await t.test(
        'durable assignment/reminder messages deduplicate, retain plan delivery and cancel completed tasks',
        async () => {
          const device = randomUUID()
          await db.query(
            "INSERT INTO app_push_device(installation_id,persona_id,auth_user_id,expo_push_token,project_id,platform) VALUES($1,$2,$3,'ExponentPushToken[fixture_token_123]',$4,'android')",
            [device, ids.supervisor, ids.auth, PUSH_PROJECT_ID]
          )
          const task = randomUUID()
          await db.query(
            "INSERT INTO operational_task(id,assignee_id,assigned_by,created_by,title,due_at) VALUES($1,$2,$3,$3,'Tarea de prueba',now()+interval '20 minutes')",
            [task, ids.supervisor, ids.coord]
          )
          const client = await db.connect()
          try {
            await client.query('BEGIN')
            await queueTaskAssignment(client, task)
            await queueTaskAssignment(client, task)
            await client.query('COMMIT')
          } finally {
            client.release()
          }
          await queueDueTaskReminders(db)
          await queueDueTaskReminders(db)
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int n FROM plan_push_outbox WHERE task_id=$1',
                [task]
              )
            ).rows[0].n,
            2
          )
          let sent = []
          await dispatchPlanNotifications({
            db,
            fetcher: async (url, input) => {
              sent = JSON.parse(input.body)
              return {
                ok: true,
                json: async () => ({
                  data: sent.map(() => ({ status: 'ok', id: randomUUID() })),
                }),
              }
            },
          })
          assert.equal(sent.length, 2)
          assert.ok(
            sent.every(
              (r) =>
                r.data.taskId === task && r.data.recipientAuthId === ids.auth
            )
          )
          const plan = (await db.query('SELECT id FROM work_plan LIMIT 1'))
            .rows[0].id
          const planClient = await db.connect()
          try {
            await planClient.query('BEGIN')
            await queuePlanNotifications(planClient, plan, 'PLAN_APPROVED')
            await planClient.query('COMMIT')
          } finally {
            planClient.release()
          }
          let planMessages = []
          await dispatchPlanNotifications({
            db,
            fetcher: async (url, input) => {
              planMessages = JSON.parse(input.body)
              return {
                ok: true,
                json: async () => ({
                  data: planMessages.map(() => ({
                    status: 'ok',
                    id: randomUUID(),
                  })),
                }),
              }
            },
          })
          assert.equal(planMessages.length, 1)
          assert.equal(planMessages[0].data.kind, 'PLAN_APPROVED')
          assert.equal(planMessages[0].data.planId, plan)
          await db.query(
            "UPDATE operational_task SET status='DONE',completed_at=now() WHERE id=$1",
            [task]
          )
          await db.query(
            "UPDATE plan_push_outbox SET status='PENDING' WHERE task_id=$1",
            [task]
          )
          await dispatchPlanNotifications({
            db,
            fetcher: async () => {
              throw Error('Must not send')
            },
          })
          assert.equal(
            (
              await db.query(
                "SELECT count(*)::int n FROM plan_push_outbox WHERE task_id=$1 AND status='CANCELLED'",
                [task]
              )
            ).rows[0].n,
            2
          )
        }
      )
    } finally {
      if (db) await db.end()
      if (created)
        await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)')
      await admin.end()
    }
  }
)
