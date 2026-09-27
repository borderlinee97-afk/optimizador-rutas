const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

// Execute the production selection predicates against an in-memory hierarchy.
// PostgreSQL casts/schema/row locks are removed; transaction locking is not tested.
function selection(file, functionName) {
  const source = fs.readFileSync(path.join(__dirname, '../services', file), 'utf8')
  const section = source.slice(source.indexOf(`async function ${functionName}`))
  const sql = section.match(/`([\s\S]*?)`/)[1]
  return sql.replace(/public\./g, '').replace(/::(?:uuid|text)/g, '')
    .replace(/FOR UPDATE OF \w+/g, '').replace(/\$(\d+)/g, ':p$1')
}
const db = new DatabaseSync(':memory:')
db.exec(`CREATE TABLE personas(id TEXT, nombre TEXT, area TEXT, rol TEXT, activo BOOLEAN, superior_id TEXT, auth_user_id TEXT);
CREATE TABLE work_plan(id TEXT, supervisor_id TEXT, status TEXT, archived_at TEXT, revision_number INTEGER);
CREATE TABLE work_plan_item(id TEXT, plan_id TEXT, cancellation_requested_by TEXT, source TEXT, item_type TEXT, removed_at TEXT);`)
for (const [id, role, superior] of [
  ['director', 'DIRECTOR', null], ['manager', 'GERENTE', 'director'],
  ['coordinator', 'COORDINADOR', 'manager'], ['otherCoordinator', 'COORDINADOR', 'manager'],
  ['supervisor', 'SUPERVISOR', 'coordinator'], ['otherSupervisor', 'SUPERVISOR', 'otherCoordinator'],
  ['directSupervisor', 'SUPERVISOR', 'manager'],
]) {
  db.prepare('INSERT INTO personas VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, id, 'FARMACIAS', role, 1, superior, id)
  db.prepare('INSERT INTO work_plan VALUES (?, ?, ?, NULL, 0)').run(id, id, 'APPROVED')
  db.prepare('INSERT INTO work_plan_item VALUES (?, ?, ?, ?, ?, NULL)').run(id, id, id, 'PLAN', 'PHARMACY')
}
const plan = db.prepare(selection('workPlanApproval.service.js', 'lockApprovalPlan'))
const cancellation = db.prepare(selection('workPlanCancellationApproval.service.js', 'lockCancellationRequestForActor'))
const cases = [
  ['COORDINADOR', 'coordinator', 'supervisor', true],
  ['COORDINADOR', 'coordinator', 'otherSupervisor', false],
  ['COORDINADOR', 'coordinator', 'coordinator', false],
  ['GERENTE', 'manager', 'coordinator', true],
  ['GERENTE', 'manager', 'directSupervisor', true],
  ['GERENTE', 'manager', 'supervisor', false],
  ['GERENTE', 'manager', 'manager', false],
  ['SUPERVISOR', 'supervisor', 'supervisor', false],
  ['DIRECTOR', 'director', 'supervisor', false],
  ['DIRECTOR', 'director', 'coordinator', false],
]
for (const [role, actor, owner, allowed] of cases) {
  test(`plan review ${role} ${actor} -> ${owner}: ${allowed}`, () => {
    assert.equal(!!plan.get({ p1: owner, p2: role, p3: actor }), allowed)
  })
  if (role !== 'DIRECTOR') test(`cancellation review ${actor} -> ${owner}: ${allowed}`, () => {
    assert.equal(!!cancellation.get({ p1: owner, p2: role, p3: actor }), allowed)
  })
}
test('Director retains the existing two-level Supervisor scope', () => {
  db.prepare('UPDATE personas SET superior_id = ? WHERE id = ?').run('director', 'coordinator')
  assert.equal(!!plan.get({ p1: 'supervisor', p2: 'DIRECTOR', p3: 'director' }), true)
  assert.equal(!!plan.get({ p1: 'coordinator', p2: 'DIRECTOR', p3: 'director' }), false)
})

test('Coordinator geofence accepts own approved PLAN and HIERARCHY_ASSIGNED only', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/mobile.visitGeofence.route.js'), 'utf8')
  const query = [...source.matchAll(/`([\s\S]*?)`/g)].map(m => m[1])
    .find(q => q.includes('wpi.source::text') && q.includes('p.rol::text'))
  const where = query.slice(query.indexOf('WHERE'), query.indexOf('LIMIT 1'))
    .replace(/::(?:uuid|text)/g, '').replace(/\$(\d+)/g, ':p$1')
  const statement = db.prepare(`SELECT wpi.id FROM work_plan_item wpi
    JOIN work_plan wp ON wp.id = wpi.plan_id JOIN personas p ON p.id = wp.supervisor_id ${where}`)
  for (const [itemSource, type, allowed] of [['PLAN', 'PHARMACY', true],
    ['HIERARCHY_ASSIGNED', 'PHARMACY', true], ['HIERARCHY_ASSIGNED', 'EXTRA_STOP', true],
    ['SUPERVISOR_ADHOC', 'EXTRA_STOP', false]]) {
    db.prepare('UPDATE work_plan_item SET source = ?, item_type = ? WHERE id = ?').run(itemSource, type, 'coordinator')
    assert.equal(!!statement.get({ p1: 'coordinator', p2: 'coordinator' }), allowed)
  }
  assert.equal(!!statement.get({ p1: 'supervisor', p2: 'coordinator' }), false)
  db.prepare('UPDATE work_plan_item SET source = ? WHERE id = ?').run('PLAN', 'coordinator')
  db.prepare('UPDATE work_plan SET status = ? WHERE id = ?').run('DRAFT', 'coordinator')
  assert.equal(!!statement.get({ p1: 'coordinator', p2: 'coordinator' }), false)
})
