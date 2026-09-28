const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync(require.resolve('../routes/mobile.workPlanItems.route.js'), 'utf8')
  .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g, '')
  .replace(/export default router\s*$/, '')

const planId = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
const pharmacy = {
  id: '7', clues: 'CLUES-7', unidad: 'Unidad 7', direccion: 'Calle 7',
  region_sanitaria: 'Centro', proyecto: 'Proyecto', estado: 'Jalisco',
  estatus: 'ACTIVA', latitud: 20, longitud: -103,
}

function harness({ role, method, found = true, planType = 'EXTRAORDINARY' }) {
  const routes = []
  const calls = { queries: [], events: [], supervisorAccess: null, activities: [] }
  const client = {
    async query(sql, params) {
      calls.queries.push({ sql, params })
      if (sql.includes('FROM public.farmacia')) return { rows: found ? [pharmacy] : [] }
      if (sql.includes('INSERT INTO public.work_plan_item')) return { rows: [{ id: itemId }] }
      return { rows: [] }
    },
    release() {},
  }
  const context = {
    Router: () => ({
      use() {},
      get() {},
      post(path, handler) { routes.push({ method: 'POST', path, handler }) },
      patch(path, handler) { routes.push({ method: 'PATCH', path, handler }) },
    }),
    pool: { connect: async () => client },
    requireAuth() {},
    parsePlannedActivitiesInput: () => ({ ok: true, value: [] }),
    getPharmacyAccess: async (_client, args) => {
      calls.supervisorAccess = args
      return { exists: found, allowed: found, pharmacy: found ? pharmacy : null }
    },
    replacePlannedActivities: async (_client, value) => { calls.activities.push(value) },
    appendWorkPlanEvent: async (_client, event) => { calls.events.push(event) },
    console: { error(error) { calls.error = error } },
  }
  vm.runInNewContext(source, context)

  context.lockOwnedPlan = async () => ({
    id: planId, status: 'DRAFT', plan_type: planType,
    period_start: '2026-10-01', period_end: '2026-10-31',
  })
  context.lockPlanItem = async () => ({
    id: itemId, pharmacy_id: '7', scheduled_date: '2026-10-10',
    scheduled_time: null, required: true, ord: 1,
    item_type: 'PHARMACY', source: 'PLAN', status: 'PENDING',
  })
  context.placeItemAtOrder = async () => {}
  context.normalizeOrdersForDate = async () => {}
  context.markPlanEdited = async () => ({ status: 'DRAFT', revision_number: 1 })
  context.getCompletePlanItem = async () => ({ id: itemId, status: 'PENDING' })
  context.mapPlanItem = row => row

  const path = method === 'POST' ? '/:planId/items' : '/:planId/items/:itemId'
  const handler = routes.find(route => route.method === method && route.path === path).handler
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
  const req = {
    params: { planId, itemId },
    profile: { id: 'owner', rol: role, pharmacy_scope_mode: 'ASSIGNED_ONLY' },
    body: { pharmacyId: '7', scheduledDate: '2026-10-11', activities: [] },
  }
  return { calls, client, context, response, run: async () => handler(req, response) }
}

for (const [method, role, planType] of [
  ['POST', 'SUPERVISOR', 'ORDINARY'],
  ['POST', 'COORDINADOR', 'EXTRAORDINARY'],
  ['PATCH', 'SUPERVISOR', 'EXTRAORDINARY'],
  ['PATCH', 'COORDINADOR', 'ORDINARY'],
]) {
  test(`${method} ${role} uses validated pharmacy and date in ${planType} plan`, async () => {
    const h = harness({ method, role, planType })
    await h.run()
    assert.equal(h.response.statusCode, method === 'POST' ? 201 : 200)
    assert.equal(h.response.body.ok, true)
    if (role === 'SUPERVISOR') {
      assert.equal(h.calls.supervisorAccess.pharmacyId, '7')
      assert.equal(h.calls.supervisorAccess.accessDate, '2026-10-11')
    } else {
      const lookup = h.calls.queries.find(({ sql }) => sql.includes('FROM public.farmacia'))
      assert.deepEqual(Array.from(lookup.params), ['7'])
      const access = await h.context.getCoordinatorPlanPharmacyAccess(h.client, '7')
      assert.equal(access.pharmacy.id, '7')
      assert.equal(access.pharmacy.clues, 'CLUES-7')
    }
    if (method === 'POST') {
      const event = h.calls.events.find(event => event.eventType === 'ITEM_CREATED')
      assert.equal(event.metadata.pharmacyId, '7')
      assert.equal(event.metadata.pharmacyClues, 'CLUES-7')
    }
    assert.equal(h.calls.activities.length, 1)
    assert.equal(h.calls.activities[0].planItemId, itemId)
    assert.equal(h.calls.error, undefined)
  })
}

for (const method of ['POST', 'PATCH']) {
  for (const role of ['SUPERVISOR', 'COORDINADOR']) {
    test(`${method} ${role} keeps PHARMACY_NOT_FOUND and rolls back`, async () => {
      const h = harness({ method, role, found: false })
      await h.run()
      assert.equal(h.response.statusCode, 404)
      assert.equal(h.response.body.code, 'PHARMACY_NOT_FOUND')
      assert.ok(h.calls.queries.some(({ sql }) => sql === 'ROLLBACK'))
      assert.ok(!h.calls.queries.some(({ sql }) => sql === 'COMMIT'))
    })
  }
}
