const test = require('node:test')
const assert = require('node:assert/strict')
const { DatabaseSync } = require('node:sqlite')
const { loadTs, hooks } = require('./helpers/loadTs.cjs')
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code } }

function sqliteHarness() {
  const databases = new Map()
  function openDatabaseSync(name) {
    if (databases.has(name)) return databases.get(name)
    const sql = new DatabaseSync(':memory:')
    const database = {
      execSync: query => sql.exec(query),
      runSync: (query, values = []) => sql.prepare(query).run(...values),
      getFirstSync: (query, values = []) => sql.prepare(query).get(...values) ?? null,
      getAllSync: (query, values = []) => sql.prepare(query).all(...values),
      withTransactionSync(fn) {
        sql.exec('BEGIN')
        try { fn(); sql.exec('COMMIT') } catch (error) { sql.exec('ROLLBACK'); throw error }
      },
      close: () => sql.close(),
    }
    databases.set(name, database)
    return database
  }
  const storage = loadTs('storage/db.ts', { 'expo-sqlite': { openDatabaseSync } })
  let response = { plan: { id: 'plan-a', status: 'APPROVED', planType: 'ORDINARY', periodStart: '2026-10-12', periodEnd: '2026-10-18' }, items: [] }
  let failure, deferred
  const tokens = []
  const planSync = loadTs('src/services/planSync.ts', {
    '../../storage/db': storage,
    '../lib/api': { ApiError, getTodayPlan: async token => {
      tokens.push(token)
      if (failure) throw failure
      return deferred ?? response
    } },
  })
  return { storage, planSync, databases, tokens,
    setResponse(value) { response = value }, fail(value) { failure = value }, defer(value) { deferred = value },
    close() { for (const db of databases.values()) db.close() } }
}

function visit(id = 'visit-a') {
  return new Proxy({ id, planId: 'plan-a', name: 'Farmacia A', itemType: 'PHARMACY', source: 'PLAN', status: 'PENDING', order: 1,
    required: true, scheduledDate: '2026-10-16', activities: [new Proxy({ id: 'activity-a', activityType: 'Inventario', order: 1, status: 'PENDING' }, { get: (object, key) => object[key] ?? null })],
  }, { get: (object, key) => object[key] ?? null })
}

test('B/D/F: real SQLite downloads plan + activities, restores them and replaces them after reconnection', async () => {
  const h = sqliteHarness(); h.storage.activateUserDatabase(A)
  h.setResponse({ plan: { id: 'plan-a', status: 'APPROVED', planType: 'ORDINARY', periodStart: '2026-10-12', periodEnd: '2026-10-18' }, items: [visit()] })
  await h.planSync.syncTodayPlan('token-a')
  let snapshot = h.planSync.readCachedTodayPlan()
  assert.equal(h.storage.db.getFirstSync('SELECT activity_type FROM plan_item_activities').activity_type, 'Inventario'); assert.ok(snapshot.syncedAt)
  h.storage.deactivateUserDatabase(); h.storage.activateUserDatabase(A)
  assert.equal(h.planSync.readCachedTodayPlan().items[0].id, 'visit-a')
  h.setResponse({ plan: null, items: [] }); await h.planSync.syncTodayPlan('token-a')
  snapshot = h.planSync.readCachedTodayPlan()
  assert.equal(snapshot.plan, null); assert.equal(snapshot.items.length, 0); assert.ok(snapshot.syncedAt)
  h.close()
})

test('E: NETWORK_ERROR leaves the SQLite plan and activities intact', async () => {
  const h = sqliteHarness(); h.storage.activateUserDatabase(A)
  h.setResponse({ plan: { id: 'plan-a' }, items: [visit()] }); await h.planSync.syncTodayPlan('token-a')
  const before = JSON.stringify(h.planSync.readCachedTodayPlan())
  const activitiesBefore = JSON.stringify(h.storage.db.getAllSync('SELECT * FROM plan_item_activities'))
  h.fail(new ApiError('offline', 0, 'NETWORK_ERROR'))
  await assert.rejects(h.planSync.syncTodayPlan('token-a'), /offline/)
  assert.equal(JSON.stringify(h.planSync.readCachedTodayPlan()), before)
  assert.equal(JSON.stringify(h.storage.db.getAllSync('SELECT * FROM plan_item_activities')), activitiesBefore); h.close()
})

test('H/I: user databases isolate all tables; logout and account changes preserve queues and evidence URIs', () => {
  const h = sqliteHarness(); h.storage.activateUserDatabase(A)
  const dbA = h.storage.db
  dbA.runSync(`INSERT INTO evidence_queue (evidence_id, idempotency_key, local_uri, mime_type, byte_size, captured_at, latitude, longitude, accuracy_m, created_at, updated_at)
    VALUES ('e', 'e', 'file:///pilot.jpg', 'image/jpeg', 3, 'now', 1, 1, 1, 1, 1)`)
  dbA.runSync(`INSERT INTO execution_outbox (id, action_type, plan_item_id, payload_json, created_at, updated_at) VALUES ('out', 'CHECK_IN', 'visit-a', '{}', 1, 1)`)
  dbA.runSync(`INSERT INTO operational_task_outbox (idempotency_key, task_id, action_type, payload_json, created_at, updated_at) VALUES ('task-out', 'task-a', 'STATUS', '{}', 1, 1)`)
  h.storage.deactivateUserDatabase(); h.storage.activateUserDatabase(B)
  for (const table of ['evidence_queue', 'execution_outbox', 'operational_task_outbox']) assert.equal(h.storage.db.getAllSync(`SELECT * FROM ${table}`).length, 0)
  h.storage.activateUserDatabase(A)
  assert.equal(h.storage.db, dbA)
  assert.equal(dbA.getFirstSync('SELECT local_uri FROM evidence_queue').local_uri, 'file:///pilot.jpg')
  assert.equal(dbA.getAllSync('SELECT * FROM execution_outbox').length, 1)
  assert.equal(dbA.getAllSync('SELECT * FROM operational_task_outbox').length, 1); h.close()
})

test('I: pending and failed evidence or executions prevent plan replacement/deletion, with rollback', async () => {
  for (const status of ['PENDING', 'UPLOADING', 'FAILED']) {
    const h = sqliteHarness(); h.storage.activateUserDatabase(A)
    h.setResponse({ plan: { id: 'plan-a' }, items: [visit()] }); await h.planSync.syncTodayPlan('token-a')
    const db = h.storage.db
    db.runSync(`INSERT INTO evidence_queue (evidence_id, idempotency_key, plan_item_id, activity_id, local_uri, mime_type, byte_size, captured_at, latitude, longitude, accuracy_m, status, created_at, updated_at)
      VALUES ('e', 'e', 'visit-a', 'activity-a', 'file:///photo.jpg', 'image/jpeg', 3, 'now', 1, 1, 1, ?, 1, 1)`, [status])
    const before = JSON.stringify(h.planSync.readCachedTodayPlan())
    h.setResponse({ plan: null, items: [] })
    await assert.rejects(h.planSync.syncTodayPlan('token-a'), error => error.code === 'LOCAL_PENDING_OPERATIONS')
    assert.throws(() => h.planSync.clearCachedPlan(), /pendientes/)
    assert.equal(JSON.stringify(h.planSync.readCachedTodayPlan()), before)
    assert.equal(db.getFirstSync('SELECT status FROM evidence_queue').status, status); h.close()
  }
})

test('H: a late plan response from A cannot write to B after switching accounts', async () => {
  const h = sqliteHarness(); h.storage.activateUserDatabase(A)
  let resolve
  h.defer(new Promise(done => { resolve = done }))
  const pending = h.planSync.syncTodayPlan('token-a')
  h.storage.activateUserDatabase(B)
  resolve({ plan: { id: 'plan-a' }, items: [visit()] })
  await assert.rejects(pending, /cuenta cambió/)
  assert.equal(h.storage.db.getAllSync('SELECT * FROM plan_items').length, 0); h.close()
})

test('unowned pilot local.db is preserved without running migrations or automatically adopting its queue', () => {
  const h = sqliteHarness()
  const legacy = h.databases.get('local.db')
  legacy.execSync('CREATE TABLE evidence_queue (evidence_id TEXT, local_uri TEXT)')
  legacy.runSync("INSERT INTO evidence_queue VALUES ('legacy', 'file:///real-pilot.jpg')")
  h.storage.activateUserDatabase(A)
  assert.equal(h.storage.hasLegacyLocalData(), true)
  assert.equal(legacy.getFirstSync('SELECT * FROM evidence_queue').local_uri, 'file:///real-pilot.jpg')
  assert.equal(h.storage.db.getAllSync('SELECT * FROM evidence_queue').length, 0); h.close()
})

test('PlanProvider never clears storage when the session/profile disappears and restores cache offline', async () => {
  const h = sqliteHarness(); h.storage.activateUserDatabase(A)
  h.setResponse({ plan: { id: 'plan-a' }, items: [visit()] }); await h.planSync.syncTodayPlan('token-a')
  const runner = hooks()
  let auth = { session: { user: { id: A }, access_token: 'token-a' }, profile: { id: 'persona-a', area: 'FARMACIAS', rol: 'SUPERVISOR' },
    loading: false, accessState: 'offline', refreshProfile: async () => {}, invalidateProfile: async () => {} }
  const provider = loadTs('src/context/PlanContext.tsx', {
    ...runner.modules, './AuthContext': { useAuth: () => auth }, '../lib/api': { ApiError },
    '../lib/supabase': { supabase: { auth: {} } },
    '../services/planSync': h.planSync, '../../storage/db': h.storage,
    '../services/executionSync': { syncVisitExecution: async () => {} },
    '../services/evidenceSync': { syncPendingEvidence: async () => { throw new Error('offline must not upload') } },
    '../services/profileCache': { isAuthorizationFailure: () => false, isNetworkFailure: () => true },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  })
  runner.mount(provider.PlanProvider); await runner.flush()
  assert.equal(runner.value.items[0].id, 'visit-a'); assert.equal(runner.value.offline, true)
  auth = { ...auth, session: null, profile: null }; runner.rerender(); await runner.flush()
  assert.equal(runner.value.items.length, 0)
  assert.equal(h.storage.db.getAllSync('SELECT * FROM plan_items').length, 1)
  runner.stop(); h.close()
})

test('PlanProvider uses the renewed SDK token after evidence sync, not the expired render token', async () => {
  const h = sqliteHarness(); h.storage.activateUserDatabase(A)
  const runner = hooks()
  const auth = { session: { user: { id: A }, access_token: 'expired' }, profile: { id: 'persona-a', area: 'FARMACIAS', rol: 'SUPERVISOR' },
    loading: false, accessState: 'online', refreshProfile: async () => {}, invalidateProfile: async () => { throw new Error('must not revoke a refreshed session') } }
  const provider = loadTs('src/context/PlanContext.tsx', {
    ...runner.modules, './AuthContext': { useAuth: () => auth }, '../lib/api': { ApiError },
    '../lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: A }, access_token: 'renewed' } } }) } } },
    '../services/planSync': h.planSync, '../../storage/db': h.storage,
    '../services/executionSync': { syncVisitExecution: async () => {} },
    '../services/evidenceSync': { syncPendingEvidence: async () => ({ synced: 0 }) },
    '../services/profileCache': { isAuthorizationFailure: () => false, isNetworkFailure: () => false },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  })
  runner.mount(provider.PlanProvider); await runner.flush()
  assert.deepEqual(h.tokens, ['renewed']); assert.equal(runner.value.ready, true)
  runner.stop(); h.close()
})

test('execution outbox alone protects the plan from replacement', async () => {
  const h = sqliteHarness(); h.storage.activateUserDatabase(A)
  h.storage.db.runSync(`INSERT INTO execution_outbox (id, action_type, plan_item_id, payload_json, created_at, updated_at) VALUES ('out', 'CHECK_IN', 'visit-a', '{}', 1, 1)`)
  await assert.rejects(h.planSync.syncTodayPlan('token-a'), error => error.code === 'LOCAL_PENDING_OPERATIONS')
  assert.equal(h.storage.db.getAllSync('SELECT * FROM execution_outbox').length, 1); h.close()
})

test('Agenda network errors remain retryable and late mutations persist only in their original user database', async () => {
  const h = sqliteHarness(); h.storage.activateUserDatabase(A)
  const databaseA = h.storage.db
  const tasks = loadTs('src/services/taskSync.ts', {
    '../../storage/db': h.storage, 'expo-crypto': { randomUUID: () => 'key' },
    '../lib/api': { ApiError, updateOperationalTaskStatus: async () => { throw new ApiError('offline', 0, 'NETWORK_ERROR') } },
  })
  assert.equal(tasks.isRetryableTaskMutationError(new ApiError('offline', 0, 'NETWORK_ERROR')), true)
  h.storage.activateUserDatabase(B)
  tasks.enqueueTaskStatus('task-a', 'DONE', 'operation-a', databaseA)
  assert.equal(h.storage.db.getAllSync('SELECT * FROM operational_task_outbox').length, 0)
  assert.equal(databaseA.getFirstSync('SELECT task_id FROM operational_task_outbox').task_id, 'task-a')
  await assert.rejects(tasks.syncAgenda('old-token-a', 'agenda', 'ALL', 'ALL', A), /cuenta cambió/)
  await tasks.flushTaskOutbox('token-a', databaseA)
  assert.equal(databaseA.getFirstSync('SELECT status FROM operational_task_outbox').status, 'PENDING'); h.close()
})

test('Weekly download survives offline date changes, selects the daily plan and preserves other days', async () => {
  const h=sqliteHarness();h.storage.activateUserDatabase(A)
  const monday=visit('monday'),tuesday=visit('tuesday')
  monday.scheduledDate='2026-10-12';tuesday.scheduledDate='2026-10-13';tuesday.activities[0].id='activity-tuesday'
  h.setResponse({plan:{id:'plan-a',periodStart:'2026-10-12',periodEnd:'2026-10-18'},downloadWindow:{scope:'week',startDate:'2026-10-12',endDate:'2026-10-18'},items:[monday,tuesday]})
  await h.planSync.syncTodayPlan('token-a')
  assert.deepEqual(h.planSync.readCachedTodayPlan('2026-10-12').items.map(x=>x.id),['monday'])
  h.storage.deactivateUserDatabase();h.storage.activateUserDatabase(A)
  assert.deepEqual(h.planSync.readCachedTodayPlan('2026-10-13').items.map(x=>x.id),['tuesday'])
  assert.equal(h.storage.db.getAllSync('SELECT id FROM plan_items').length,2)
  assert.equal(h.planSync.readCachedTodayPlan('2026-10-19').items.length,0)
  assert.equal(h.planSync.readCachedTodayPlan('2026-10-19').plan,null)
  h.planSync.clearCachedPlan()
  assert.equal(h.storage.db.getFirstSync('SELECT count(*) AS n FROM plan_download_window').n,0)
  assert.equal(h.planSync.readCachedTodayPlan('2026-10-13').items.length,0)
  h.storage.activateUserDatabase(B)
  assert.equal(h.planSync.readCachedTodayPlan('2026-10-13').items.length,0)
  h.close()
})

test('real backend Date rows survive JSON, weekly SQLite caching and the Mi trabajo day filter', async () => {
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
  const source=fs.readFileSync(path.join(__dirname,'../../backend/routes/mobile.farmacias.route.js'),'utf8')
    .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export default router\s*$/,'')
  const context={Date,requireAuth(){},Router:()=>({use(){},get(){},post(){},patch(){}})}
  vm.runInNewContext(source,context)
  const rows=[
    {id:'extra-519',item_type:'EXTRA_STOP',source:'SUPERVISOR_ADHOC',custom_name:'519',scheduled_date:new Date('2026-10-19T00:00:00Z')},
    {id:'extra-518',item_type:'EXTRA_STOP',source:'SUPERVISOR_ADHOC',custom_name:'518',scheduled_date:new Date('2026-10-19T00:00:00Z')},
    {id:'pharmacy-today',item_type:'PHARMACY',pharmacy_id:'17',source:'PLAN',name:'Assigned unit',scheduled_date:new Date('2026-10-19T00:00:00Z')},
    {id:'tomorrow',item_type:'PHARMACY',source:'PLAN',scheduled_date:new Date('2026-10-20T00:00:00Z')},
  ]
  const response=JSON.parse(JSON.stringify({
    plan:{id:'plan-a',status:'APPROVED',planType:'ORDINARY',periodStart:'2026-10-19',periodEnd:'2026-10-25'},
    downloadWindow:{scope:'week',startDate:'2026-10-19',endDate:'2026-10-25'},
    items:rows.map((row,i)=>({...context.mapPlanItem({...row,plan_id:'plan-a',status:'PENDING',ord:i+1,required:true}),activities:[]})),
  }))
  const h=sqliteHarness();h.storage.activateUserDatabase(A)
  try {
    assert.equal(response.items[0].scheduledDate,'2026-10-19')
    // Reproduce the previous wire format: Date became an ISO timestamp and
    // SQLite's exact calendar-day filter hid every downloaded item.
    h.setResponse({...response,items:response.items.map((item,i)=>({...item,scheduledDate:rows[i].scheduled_date.toISOString()}))})
    await h.planSync.syncTodayPlan('token-a')
    assert.equal(h.storage.db.getAllSync('SELECT id FROM plan_items').length,4)
    assert.equal(h.planSync.readCachedTodayPlan('2026-10-19').items.length,0)
    h.setResponse(response)
    await h.planSync.syncTodayPlan('token-a') // Includes JSON serialization used by Express.
    assert.deepEqual(h.storage.db.getAllSync('SELECT id,scheduled_date FROM plan_items ORDER BY ord').map(x=>[x.id,x.scheduled_date]),rows.map(x=>[x.id,x.scheduled_date.toISOString().slice(0,10)]))
    assert.deepEqual(h.planSync.readCachedTodayPlan('2026-10-19').items.map(item=>item.id),['extra-519','extra-518','pharmacy-today'])
    assert.deepEqual(h.planSync.readCachedTodayPlan('2026-10-20').items.map(item=>item.id),['tomorrow'])
    assert.equal(response.items[0].scheduledDate,'2026-10-19')
    // A refresh repairs an already downloaded timestamp-shaped calendar date.
    h.storage.db.runSync("UPDATE plan_items SET scheduled_date='2026-10-19T00:00:00.000Z' WHERE id='extra-519'")
    await h.planSync.syncTodayPlan('token-a')
    assert.ok(h.planSync.readCachedTodayPlan('2026-10-19').items.some(item=>item.id==='extra-519'))
    h.storage.deactivateUserDatabase();h.storage.activateUserDatabase(A)
    assert.equal(h.planSync.readCachedTodayPlan('2026-10-19').items.length,3)
  } finally {h.close()}
})
