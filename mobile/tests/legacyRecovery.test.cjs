const test = require('node:test')
const assert = require('node:assert/strict')
const { DatabaseSync } = require('node:sqlite')
const { createHash } = require('node:crypto')
const { loadTs } = require('./helpers/loadTs.cjs')

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
const PA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const P = '33333333-3333-4333-8333-333333333333', V = '44444444-4444-4444-8444-444444444444'
const ACT = '55555555-5555-4555-8555-555555555555', E = '66666666-6666-4666-8666-666666666666'
const T = '77777777-7777-4777-8777-777777777777'
class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code } }
const network = () => new ApiError('offline', 0, 'NETWORK_ERROR')
const rowProxy = object => new Proxy(object, { get: (object, key) => object[key] ?? null })
const remoteVisit = () => rowProxy({ id: V, planId: P, name: 'Visita verificada A', itemType: 'PHARMACY', source: 'PLAN',
  status: 'PENDING', order: 1, required: true, scheduledDate: '2026-10-15',
  activities: [rowProxy({ id: ACT, planItemId: V, activityType: 'Inventario', order: 1, status: 'PENDING' })] })

function harness() {
  const databases = new Map()
  function openDatabaseSync(name) {
    if (databases.has(name)) return databases.get(name)
    const sql = new DatabaseSync(':memory:')
    const database = {
      execSync: query => sql.exec(query), runSync: (query, values = []) => sql.prepare(query).run(...values),
      getFirstSync: (query, values = []) => sql.prepare(query).get(...values) ?? null,
      getAllSync: (query, values = []) => sql.prepare(query).all(...values),
      withTransactionSync(fn) { sql.exec('BEGIN'); try { fn(); sql.exec('COMMIT') } catch (error) { sql.exec('ROLLBACK'); throw error } },
      close: () => sql.close(),
    }
    databases.set(name, database); return database
  }
  const storage = loadTs('storage/db.ts', { 'expo-sqlite': { openDatabaseSync } })
  storage.activateUserDatabase(A)
  const databaseA = storage.db, legacy = databases.get('local.db')
  // The fixture uses the real application schema, but the source never runs an app migration.
  for (const table of storage.legacyTables) legacy.execSync(databaseA.getFirstSync('SELECT sql FROM sqlite_master WHERE name = ?', [table]).sql)
  legacy.execSync('PRAGMA foreign_keys = ON')
  let currentUser = A, currentProfile = PA, failure = null, onDigest = null, revoked = false, today = { plan: null, items: [] }
  const plans = new Map([[P, { plan: { id: P, supervisorId: PA }, items: [remoteVisit()] }]])
  const tasks = new Map(), readyEvidence = new Map(), calls = []
  const api = {
    ApiError,
    getCurrentProfile: async () => {
      calls.push('GET /api/auth/me'); if (failure) throw failure
      return { user: { id: currentUser }, profile: { id: currentProfile, activo: !revoked, area: 'FARMACIAS', rol: 'COORDINADOR' } }
    },
    apiRequest: async (path, options) => {
      assert.equal(options.method, 'GET'); calls.push(`GET ${path}`)
      if (failure) throw failure
      if (path.includes('/mine?')) return { plans: [...plans.keys()].map(id => ({ id })) }
      const id = decodeURIComponent(path.split('/').pop())
      const proof = path.includes('/work-plans/') ? plans.get(id) : tasks.get(id)
      if (!proof) throw new ApiError('not found', 404)
      return proof
    },
    listVisitEvidence: async id => { calls.push(`GET evidence/${id}`); return { evidence: readyEvidence.get(id) ?? [] } },
    getTodayPlan: async () => today,
  }
  const planSync = loadTs('src/services/planSync.ts', { '../../storage/db': storage, '../lib/api': api })
  const recovery = loadTs('src/services/legacyRecovery.ts', {
    '../../storage/db': storage, '../lib/api': api, './planSync': planSync,
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_algorithm, source) => {
      onDigest?.(); return createHash('sha256').update(source).digest('hex')
    } },
  })
  const seed = ({ parent = true, activities = true, evidence = true, execution = true, snapshot = true } = {}) => {
    if (parent) legacy.runSync(`INSERT INTO plan_items (id, plan_id, name, item_type, source, scheduled_date, synced_at) VALUES (?, ?, 'Farmacia piloto', 'PHARMACY', 'PLAN', '2026-10-15', 100)`, [V, P])
    if (parent && activities) legacy.runSync(`INSERT INTO plan_item_activities (id, plan_item_id, activity_type, synced_at) VALUES (?, ?, 'Inventario', 100)`, [ACT, V])
    if (evidence) legacy.runSync(`INSERT INTO evidence_queue (evidence_id, idempotency_key, plan_item_id, activity_id, local_uri, mime_type, byte_size, captured_at, latitude, longitude, accuracy_m, status, attempts, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'file:///documents/visit-evidence/pilot.jpg', 'image/jpeg', 3, '2026-10-15T18:00:00Z', 20, -103, 8, 'FAILED', 3, 'network', 100, 100)`, [E, E, V, ACT])
    if (execution) legacy.runSync(`INSERT INTO execution_outbox (id, action_type, plan_item_id, activity_id, payload_json, depends_on_evidence_id, created_at, updated_at)
      VALUES ('operation', 'ACTIVITY_DONE', ?, ?, '{}', ?, 100, 100)`, [V, ACT, E])
    if (snapshot) legacy.runSync(`INSERT INTO plan_cache (cache_key, plan_id, status, plan_type, period_start, period_end, synced_at)
      VALUES ('today', ?, 'APPROVED', 'ORDINARY', '2026-10-12', '2026-10-18', 100)`, [P])
  }
  return { storage, databaseA, legacy, recovery, planSync, plans, tasks, readyEvidence, calls, seed,
    snapshot: () => JSON.stringify(storage.legacyTables.map(table => legacy.getAllSync(`SELECT * FROM ${table}`))),
    run: () => { const userId = currentUser, profileId = currentProfile; return recovery.recoverLegacyData({ userId, profileId, accessToken: 'sdk-token',
      isCurrent: () => currentUser === userId && currentProfile === profileId && storage.isDatabaseActive(userId) }) },
    switch(user, profile) { currentUser = user; currentProfile = profile; storage.activateUserDatabase(user) },
    fail(error) { failure = error }, revoke() { revoked = true }, onDigest(fn) { onDigest = fn },
    today(response) { today = response },
    close() { for (const db of databases.values()) db.close() },
  }
}

test('recovers verified visits, activities, photo references and queues without changing any pilot source row', async () => {
  const h = harness(); h.seed(); const original = h.snapshot()
  const result = await h.run()
  assert.equal(result.copied, 5); assert.equal(result.retained, 0)
  assert.equal(h.snapshot(), original)
  assert.equal(h.databaseA.getFirstSync('SELECT * FROM evidence_queue').local_uri, 'file:///documents/visit-evidence/pilot.jpg')
  assert.equal(h.databaseA.getFirstSync('SELECT * FROM evidence_queue').status, 'FAILED')
  assert.equal(h.databaseA.getFirstSync('SELECT * FROM evidence_queue').attempts, 3)
  assert.equal(h.databaseA.getFirstSync('SELECT * FROM execution_outbox').depends_on_evidence_id, E)
  assert.equal(h.planSync.readCachedTodayPlan().syncedAt, 100)
  assert.equal(h.recovery.readRecoveredVisits(A)[0].id, V)
  assert.ok(h.calls.every(call => call.startsWith('GET '))); h.close()
})

test('repeated recovery never downgrades READY evidence or recreates an already consumed operation', async () => {
  const h = harness(); h.seed(); await h.run()
  h.databaseA.runSync("UPDATE evidence_queue SET status = 'READY', attempts = 4")
  h.databaseA.runSync('DELETE FROM execution_outbox')
  const result = await h.run()
  assert.equal(result.copied, 0); assert.equal(result.alreadyRecovered, 5)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM execution_outbox').length, 0)
  assert.equal(h.databaseA.getFirstSync('SELECT * FROM evidence_queue').status, 'READY'); h.close()
})

test('hierarchical visibility or a different current user is not exact plan ownership', async () => {
  const h = harness(); h.seed(); const original = h.snapshot()
  h.switch(B, PB); const result = await h.run()
  assert.equal(result.copied, 0); assert.ok(result.retained > 0)
  assert.equal(h.storage.db.getAllSync('SELECT * FROM evidence_queue').length, 0)
  assert.equal(h.snapshot(), original); h.close()
})

test('the central journal prevents reassigning an already recovered source to a different auth ID, even if a persona is relinked', async () => {
  const h = harness(); h.seed(); await h.run()
  h.switch(B, PA); const result = await h.run()
  assert.equal(result.copied, 0); assert.ok(result.reasons.claim_conflict)
  assert.equal(h.storage.db.getAllSync('SELECT * FROM evidence_queue').length, 0); h.close()
})

test('network failure and revoked authorization leave source, destinations and claims unchanged', async () => {
  for (const revoked of [false, true]) {
    const h = harness(); h.seed(); const original = h.snapshot()
    if (revoked) h.revoke(); else h.fail(network())
    await assert.rejects(h.run())
    assert.equal(h.snapshot(), original)
    assert.equal(h.databaseA.getAllSync('SELECT * FROM evidence_queue').length, 0)
    assert.equal(h.storage.isLegacyRecoveryActive(), false); h.close()
  }
})

test('an account change during async hashing cancels transfer before writing to either account', async () => {
  const h = harness(); h.seed(); const original = h.snapshot()
  h.onDigest(() => h.switch(B, PB))
  await assert.rejects(h.run(), /cuenta cambió/)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM evidence_queue').length, 0)
  assert.equal(h.storage.db.getAllSync('SELECT * FROM evidence_queue').length, 0)
  assert.equal(h.snapshot(), original); h.close()
})

test('a failed destination transaction is rolled back and only the verified original owner can resume its reservation', async () => {
  const h = harness(); h.seed(); const original = h.snapshot()
  const run = h.databaseA.runSync
  h.databaseA.runSync = (sql, values) => {
    if (sql.includes('INSERT INTO legacy_recovery_receipts')) throw new Error('disk write failed')
    return run(sql, values)
  }
  const first = await h.run()
  assert.ok(first.retained); assert.equal(h.databaseA.getAllSync('SELECT * FROM plan_items').length, 0)
  assert.equal(h.storage.getLegacyRecoveryJournal().getFirstSync('SELECT state FROM recovery_claims').state, 'RESERVED')
  h.databaseA.runSync = run
  const resumed = await h.run()
  assert.equal(resumed.copied, 5); assert.equal(h.snapshot(), original); h.close()
})

test('a crash between destination commit and journal completion resumes from the receipt without replay', async () => {
  const h = harness(); h.seed()
  const journal = h.storage.getLegacyRecoveryJournal(), run = journal.runSync
  journal.runSync = (sql, values) => {
    if (sql.startsWith('UPDATE recovery_claims')) throw new Error('interrupted')
    return run(sql, values)
  }
  await assert.rejects(h.run(), /interrupted/)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM plan_items').length, 1)
  journal.runSync = run
  const result = await h.run()
  assert.equal(result.alreadyRecovered, 1); assert.equal(result.copied, 4); h.close()
})

test('identity or idempotency collisions preserve both records rather than replacing the destination', async () => {
  const h = harness(); h.seed(); const original = h.snapshot()
  const source = h.legacy.getFirstSync('SELECT * FROM evidence_queue')
  const fields = Object.keys(source)
  h.databaseA.runSync(`INSERT INTO evidence_queue (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, fields.map(field => field === 'idempotency_key' ? 'different-key' : source[field]))
  const result = await h.run()
  assert.ok(result.reasons.destination_conflict)
  assert.equal(h.databaseA.getFirstSync('SELECT idempotency_key FROM evidence_queue').idempotency_key, 'different-key')
  assert.equal(h.snapshot(), original); h.close()
})

test('orphaned photos rebuild their parent from exact-owner server data, not a guessed local account', async () => {
  const h = harness(); h.seed({ parent: false, snapshot: false })
  const result = await h.run()
  assert.equal(result.retained, 0)
  assert.equal(h.databaseA.getFirstSync('SELECT name FROM plan_items').name, 'Visita verificada A')
  assert.equal(h.databaseA.getFirstSync('SELECT plan_item_id FROM plan_item_activities').plan_item_id, V)
  assert.equal(h.recovery.readRecoveredVisits(A)[0].id, V)
  assert.equal(h.planSync.readCachedTodayPlan().items.length, 0)
  assert.equal(h.databaseA.getFirstSync('SELECT status FROM evidence_queue').status, 'FAILED'); h.close()
})

test('recovered historical photos/activities survive new plan sync without appearing in today or blocking its update', async () => {
  const h = harness(); h.seed()
  await h.planSync.syncTodayPlan('token') // Authoritative empty today must not be replaced by the old snapshot.
  await h.run(); await h.planSync.syncTodayPlan('token')
  assert.equal(h.planSync.readCachedTodayPlan().items.length, 0)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM plan_item_activities').length, 1)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM execution_outbox').length, 1)
  assert.equal(h.databaseA.getFirstSync('SELECT local_uri FROM evidence_queue').local_uri, 'file:///documents/visit-evidence/pilot.jpg')
  assert.equal(h.recovery.readRecoveredVisits(A).length, 1); h.close()
})

test('a server-confirmed READY orphan can be recovered by immutable evidence owner even after the visit disappears', async () => {
  const h = harness(); h.seed({ parent: false, execution: false, snapshot: false }); h.plans.clear()
  h.readyEvidence.set(V, [{ id: E, supervisorId: PA, planItemId: V, activityId: ACT, status: 'READY' }])
  const result = await h.run()
  assert.equal(result.copied, 1)
  assert.equal(h.databaseA.getFirstSync('SELECT status FROM evidence_queue').status, 'READY')
  assert.equal(h.recovery.readRecoveredEvidenceTargets(A)[0].plan_item_id, V); h.close()
})

test('current task assignment never attributes unsent comments; exact server author can confirm a delivered comment', async () => {
  const h = harness()
  h.legacy.runSync(`INSERT INTO operational_task_outbox (idempotency_key, task_id, action_type, payload_json, created_at, updated_at)
    VALUES ('comment', ?, 'COMMENT', '{"body":"nota piloto"}', 100, 100)`, [T])
  h.tasks.set(T, { task: { id: T, assigneeId: PA }, evidence: [], comments: [] })
  let result = await h.run()
  assert.equal(result.copied, 0); assert.equal(result.reasons.task_actor_unverified, 1)
  h.tasks.get(T).comments = [{ id: 'comment', task_id: T, author_id: PA, body: 'nota piloto' }]
  result = await h.run()
  assert.equal(result.confirmed, 1)
  assert.equal(h.databaseA.getFirstSync('SELECT status FROM operational_task_outbox').status, 'SYNCED')
  assert.equal(h.legacy.getFirstSync('SELECT status FROM operational_task_outbox').status, 'PENDING'); h.close()
})

test('task photos require the exact evidence supervisor, even when the task has been reassigned', async () => {
  const h = harness(); h.seed({ parent: false, execution: false, snapshot: false })
  h.legacy.runSync('UPDATE evidence_queue SET plan_item_id = NULL, activity_id = NULL, task_id = ?', [T])
  h.tasks.set(T, { task: { id: T, assigneeId: PB }, evidence: [{ id: E, task_id: T, supervisor_id: PA }], comments: [] })
  const result = await h.run()
  assert.equal(result.copied, 1); assert.equal(h.databaseA.getFirstSync('SELECT task_id FROM evidence_queue').task_id, T); h.close()
})

test('a server-confirmed task photo is recovered READY without enqueueing a new upload', async () => {
  const h = harness(); h.seed({ parent: false, execution: false, snapshot: false })
  h.legacy.runSync('UPDATE evidence_queue SET plan_item_id = NULL, activity_id = NULL, task_id = ?', [T])
  h.tasks.set(T, { task: { id: T, assigneeId: PB }, evidence: [{ id: E, task_id: T, supervisor_id: PA, status: 'READY' }], comments: [] })
  const original = h.snapshot(); await h.run()
  assert.equal(h.databaseA.getFirstSync('SELECT status FROM evidence_queue').status, 'READY')
  assert.ok(h.calls.every(call => call.startsWith('GET '))); assert.equal(h.snapshot(), original); h.close()
})

test('unknown schema columns retain the original evidence and its dependent execution without losing fields', async () => {
  const h = harness(); h.seed()
  h.legacy.execSync('ALTER TABLE evidence_queue ADD COLUMN future_field TEXT')
  const original = h.snapshot(), result = await h.run()
  assert.ok(result.reasons.destination_conflict); assert.ok(result.reasons.dependency_unavailable)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM evidence_queue').length, 0)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM execution_outbox').length, 0)
  assert.equal(h.snapshot(), original); h.close()
})

test('unsubmitted task photos and status changes remain unassigned even when the current account owns the task', async () => {
  const h = harness(); h.seed({ parent: false, execution: false, snapshot: false })
  h.legacy.runSync('UPDATE evidence_queue SET plan_item_id = NULL, activity_id = NULL, task_id = ?', [T])
  h.legacy.runSync(`INSERT INTO operational_task_outbox (idempotency_key, task_id, action_type, payload_json, created_at, updated_at)
    VALUES ('status', ?, 'STATUS', '{"status":"DONE"}', 100, 100)`, [T])
  h.tasks.set(T, { task: { id: T, assigneeId: PA }, evidence: [], comments: [] })
  const original = h.snapshot(), result = await h.run()
  assert.equal(result.copied, 0); assert.equal(result.retained, 2)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM evidence_queue').length, 0)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM operational_task_outbox').length, 0)
  assert.equal(h.snapshot(), original); h.close()
})

test('a missing activity can be rebuilt from exact-owner server data without changing the original photo or execution', async () => {
  const h = harness(); h.seed({ activities: false }); const original = h.snapshot()
  const result = await h.run()
  assert.equal(result.retained, 0)
  assert.equal(h.databaseA.getFirstSync('SELECT id FROM plan_item_activities').id, ACT)
  assert.equal(h.databaseA.getFirstSync('SELECT activity_id FROM evidence_queue').activity_id, ACT)
  assert.equal(h.databaseA.getFirstSync('SELECT depends_on_evidence_id FROM execution_outbox').depends_on_evidence_id, E)
  assert.equal(h.snapshot(), original); h.close()
})

test('a pending recovered visit cannot be overwritten if it reappears in the current plan', async () => {
  const h = harness(); h.seed(); await h.planSync.syncTodayPlan('token'); await h.run()
  h.today({ plan: null, items: [remoteVisit()] })
  await assert.rejects(h.planSync.syncTodayPlan('token'), error => error.code === 'LOCAL_PENDING_OPERATIONS')
  assert.equal(h.databaseA.getFirstSync('SELECT name FROM plan_items').name, 'Farmacia piloto')
  assert.equal(h.databaseA.getFirstSync('SELECT attempts FROM evidence_queue').attempts, 3)
  assert.equal(h.planSync.readCachedTodayPlan().items.length, 0); h.close()
})

test('legacy changes detected after proof verification are not copied under an obsolete hash', async () => {
  const h = harness(); h.seed()
  h.onDigest(() => h.legacy.runSync("UPDATE plan_items SET name = 'changed after proof'"))
  const result = await h.run()
  assert.ok(result.reasons.legacy_changed)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM plan_items').length, 0)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM evidence_queue').length, 0)
  assert.equal(h.legacy.getFirstSync('SELECT name FROM plan_items').name, 'changed after proof'); h.close()
})

test('a copied journal claim with a missing receipt never recreates consumed queues in a fresh destination', async () => {
  const h = harness(); h.seed(); await h.run()
  h.databaseA.runSync('DELETE FROM legacy_recovery_receipts')
  h.databaseA.runSync('DELETE FROM execution_outbox')
  const result = await h.run()
  assert.equal(result.reasons.receipt_missing, 5)
  assert.equal(h.databaseA.getAllSync('SELECT * FROM execution_outbox').length, 0); h.close()
})
