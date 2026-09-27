import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

// Load the real route functions with boundary stubs, without installed packages.
function loadRoute(file, pool) {
  const routes = []
  const source = readFileSync(new URL(`../routes/${file}`, import.meta.url), 'utf8')
    .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g, '')
    .replace(/export default router\s*$/, '')
  const context = {
    pool, console,
    Router: () => ({ use() {}, get(...args) { routes.push(args) }, post() {} }),
    requireAuth() {},
    canAccessPersona: async () => true,
    attachActivitiesToItems: async (_, items) => items,
    attachEvidenceToPlanItems: async (_, items) => items,
  }
  runInNewContext(source, context)
  return { context, routes }
}

test('POST profile guard accepts approval roles and rejects Supervisor/inactive/wrong area', async () => {
  for (const [rol, activo, area, allowed] of [
    ['COORDINADOR', true, 'FARMACIAS', true],
    ['GERENTE', true, 'FARMACIAS', true],
    ['DIRECTOR', true, 'FARMACIAS', true],
    ['SUPERVISOR', true, 'FARMACIAS', false],
    ['COORDINADOR', false, 'FARMACIAS', false],
    ['COORDINADOR', true, 'OPERACIONES', false],
  ]) {
    const { context } = loadRoute('web.workPlanActions.route.js', {
      query: async () => ({ rowCount: 1, rows: [{ rol, activo, area }] }),
    })
    let passed = false
    let status
    const res = { status(value) { status = value; return this }, json() {} }
    await context.loadManagerProfile({ auth: { user: { id: 'auth' } } }, res, () => { passed = true })
    assert.equal(passed, allowed, rol)
    if (!allowed) assert.equal(status, 403)
  }
})

test('detail forwards actor into SQL authorization and reflects its result in both capabilities', async () => {
  for (const canReview of [true, false]) {
    const queries = []
    const { routes } = loadRoute('web.workPlans.route.js', {
      async query(sql, params) {
        queries.push({ sql, params })
        return { rows: queries.length === 1 ? [{ supervisor_id: 'owner', status: 'PENDING_APPROVAL', can_review: canReview }] : [] }
      },
    })
    let response
    await routes.find(([path]) => path === '/:planId')[1](
      { params: { planId: '11111111-1111-4111-8111-111111111111' }, profile: { id: 'actor', rol: 'COORDINADOR' } },
      { json(value) { response = value }, status() { return this } },
    )
    assert.equal(response.permissions.canApprove, canReview)
    assert.equal(response.permissions.canReject, canReview)
    assert.equal(queries[0].params[1], 'actor')
    assert.equal(queries[0].params[2], 'COORDINADOR')
    const sql = queries[0].sql.replace(/\s+/g, ' ')
    assert.match(sql, /supervisor\.superior_id = \$2::uuid/)
    assert.match(sql, /wp\.supervisor_id <> \$2::uuid/)
    assert.match(sql, /wp\.archived_at IS NULL/)
    assert.match(sql, /wp\.status::text = 'PENDING_APPROVAL'/)
    assert.doesNotMatch(sql, /\$3::text = 'DIRECTOR'/)
  }
})

test('cancellation inbox keeps supported sources and requester hierarchy/anti-self constraints', () => {
  let sql
  const { context } = loadRoute('web.approvals.route.js', { query(value) { sql = value.replace(/\s+/g, ' ') } })
  context.getPendingCancellations({ id: 'actor', rol: 'COORDINADOR' })
  assert.match(sql, /'HIERARCHY_ASSIGNED'/)
  assert.match(sql, /'EXTRA_STOP'/)
  assert.match(sql, /supervisor\.id = requester\.id/)
  assert.match(sql, /requester\.superior_id = \$2::uuid/)
  assert.match(sql, /requester\.id <> \$2::uuid/)
  assert.match(sql, /requester\.rol::text = 'SUPERVISOR'/)
})

function loadService(file) {
  const source = readFileSync(new URL(`../services/${file}`, import.meta.url), 'utf8')
    .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g, '')
    .replace(/export /g, '')
  const context = { console }
  runInNewContext(source, context)
  return context
}

test('plan service preserves roles, scoped locking, anti-self and pending/archive rejection', async () => {
  const service = loadService('workPlanApproval.service.js')
  for (const rol of ['COORDINADOR', 'GERENTE', 'DIRECTOR']) {
    assert.equal(service.validateApprovalActor({ id: 'actor', area: 'FARMACIAS', rol }), rol)
    let sql
    await service.lockApprovalPlan({ query: async value => { sql = value.replace(/\s+/g, ' '); return { rows: [] } } }, 'plan', rol, 'actor')
    assert.match(sql, /supervisor\.superior_id = \$3::uuid/)
    assert.match(sql, /wp\.supervisor_id <> \$3::uuid/)
    assert.match(sql, /coordinator\.superior_id = \$3::uuid/)
    assert.match(sql, /FOR UPDATE OF wp/)
  }
  assert.throws(() => service.validateApprovalActor({ id: 'actor', area: 'FARMACIAS', rol: 'SUPERVISOR' }), { code: 'APPROVAL_ROLE_REQUIRED' })
  assert.throws(() => service.validatePendingPlan(null), { code: 'WORK_PLAN_APPROVAL_NOT_FOUND' })
  for (const status of ['DRAFT', 'APPROVED', 'REJECTED']) {
    assert.throws(() => service.validatePendingPlan({ status }), { code: 'WORK_PLAN_NOT_PENDING_APPROVAL' })
  }
  assert.throws(() => service.validatePendingPlan({ status: 'PENDING_APPROVAL', archived_at: 'date' }), { code: 'WORK_PLAN_ARCHIVED' })
  service.validatePendingPlan({ status: 'PENDING_APPROVAL' })
})

test('cancellation service blocks requester self-review and accepts existing planned/assigned types', () => {
  const service = loadService('workPlanCancellationApproval.service.js')
  const item = { cancellation_requested_by: 'requester', plan_status: 'APPROVED', status: 'PENDING', cancellation_request_status: 'PENDING' }
  assert.throws(() => service.validatePendingCancellationRequest(item, 'requester'), { code: 'SELF_CANCELLATION_REVIEW_NOT_ALLOWED' })
  for (const [source, item_type] of [['PLAN', 'PHARMACY'], ['HIERARCHY_ASSIGNED', 'PHARMACY'], ['HIERARCHY_ASSIGNED', 'EXTRA_STOP']]) {
    service.validatePendingCancellationRequest({ ...item, source, item_type }, 'superior')
  }
  assert.throws(() => service.validateApprovalActor({ id: 'actor', area: 'FARMACIAS', rol: 'SUPERVISOR' }), { code: 'APPROVAL_ROLE_REQUIRED' })
})
