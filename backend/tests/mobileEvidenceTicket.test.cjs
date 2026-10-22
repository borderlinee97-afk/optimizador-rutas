const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync(require.resolve('../routes/mobile.evidence.route.js'), 'utf8')
const ticketSource = source.slice(
  source.indexOf('async function createUploadTicket('),
  source.indexOf('async function lockEvidenceTarget('),
)

function harness({ status = 'PENDING_UPLOAD', mimeType = 'image/jpeg', reason = null, activityId = null, existing = true, itemCount = 0 } = {}) {
  const row = {
    id: 'evidence', idempotency_key: 'key', supervisor_id: 'owner',
    plan_item_id: 'item', activity_id: activityId, task_id: null,
    mime_type: mimeType, byte_size: 10, status, rejection_reason: reason,
    storage_path: 'owner/visits/item/evidence.jpg',
  }
  const queries = []
  let signed = 0
  const client = {
    async query(sql, params) {
      queries.push(sql)
      if (sql.includes('WHERE idempotency_key =')) return { rows: existing ? [row] : [] }
      if (sql.includes('COUNT(*)')) return { rows: [{item_count:itemCount}] }
      if (sql.includes('INSERT INTO public.visit_evidence')) return { rows: [row] }
      if (sql.includes('SET byte_size =')) {
        row.byte_size = params[1]
        return { rows: [row] }
      }
      if (sql.includes("status = 'PENDING_UPLOAD'")) {
        row.status = 'PENDING_UPLOAD'; row.rejection_reason = null
        return { rows: [row] }
      }
      return { rows: [] }
    },
    release() {},
  }
  const context = {
    parseEvidencePayload: () => ({ ok: true, value: {
      idempotencyKey: 'key', evidenceId: 'evidence', mimeType: 'image/jpeg', byteSize: 3,
    } }),
    positiveInteger: (_, fallback) => fallback,
    pool: { connect: async () => client },
    lockEvidenceTarget: async () => {},
    expireStalePendingUploads: async () => {},
    enforceEvidenceLimits: vm.runInNewContext(source.slice(source.indexOf('async function enforceEvidenceLimits('),source.indexOf('async function expireStalePendingUploads('))+'\nenforceEvidenceLimits', {Number, EvidenceLimitError:class extends Error{constructor(message,code){super(message);this.code=code;this.status=409}}}),
    createSignedUploadTicket: async () => { signed++; return { token: 'signed' } },
    mapEvidence: evidence => ({ byteSize: evidence.byte_size, status: evidence.status }),
    STALE_PENDING_UPLOAD_REASON: 'stale',
    DEFAULT_PENDING_UPLOAD_TTL_MINUTES: 120,
    ALLOWED_MIME_TYPES:new Map([['image/jpeg','jpg']]),EVIDENCE_BUCKET:'visit-evidence',
    process: { env: {} },
  }
  const createUploadTicket = vm.runInNewContext(`${ticketSource}\ncreateUploadTicket`, context)
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
  const target = { ownerId: 'owner', planItemId: 'item', activityId, taskId: null }
  return {
    row, queries, response,
    async run() { await createUploadTicket({ body: {} }, response, target); return response },
    signedCount: () => signed,
  }
}

for (const options of [{}, { status: 'REJECTED', reason: 'stale' }]) {
  test(`reconciles existing evidence before signing: ${JSON.stringify(options)}`, async () => {
    const h = harness(options)
    const response = await h.run()
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.evidence.byteSize, 3)
    assert.equal(h.row.status, 'PENDING_UPLOAD')
    assert.equal(h.signedCount(), 1)
    assert.ok(h.queries.findIndex(sql => sql.includes('SET byte_size =')) <
      h.queries.findIndex(sql => sql === 'COMMIT'))
  })
}

test('MIME conflict does not change the existing evidence', async () => {
  const h = harness({ mimeType: 'image/png' })
  const response = await h.run()
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.code, 'EVIDENCE_IDEMPOTENCY_CONFLICT')
  assert.equal(h.row.byte_size, 10)
  assert.equal(h.signedCount(), 0)
})

test('READY evidence keeps its original byte size', async () => {
  const h = harness({ status: 'READY' })
  const response = await h.run()
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.evidence.byteSize, 10)
  assert.equal(h.signedCount(), 0)
})

test('a rejection for another reason cannot be reactivated or resized', async () => {
  const h = harness({ status: 'REJECTED', reason: 'policy' })
  const response = await h.run()
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.code, 'EVIDENCE_REJECTED')
  assert.equal(h.row.byte_size, 10)
  assert.equal(h.signedCount(), 0)
})


test('activity photos keep uploading after photo three and total photo ten, including the fourth activity',async()=>{
  for(const activityId of ['activity-1','activity-4','activity-5']){
    const h=harness({activityId,existing:false,itemCount:100})
    const response=await h.run()
    assert.equal(response.statusCode,201)
    assert.equal(h.signedCount(),1)
    assert.ok(h.queries.some(sql=>sql.includes('INSERT INTO public.visit_evidence')))
  }
})

test('the original general-visit photo cap remains and counts only photos without an activity',async()=>{
  const h=harness({existing:false,itemCount:10})
  await assert.rejects(h.run(),{code:'EVIDENCE_ITEM_LIMIT_REACHED',status:409})
  assert.equal(h.signedCount(),0)
  const query=h.queries.find(sql=>sql.includes('COUNT(*)'))
  assert.match(query,/activity_id IS NULL/)
  const available=harness({existing:false,itemCount:9})
  assert.equal((await available.run()).statusCode,201)
})

test('the published evidence policy no longer advertises a per-activity count cap',async()=>{
  const {getEvidencePolicy}=await import('../services/evidencePolicy.service.js')
  const policy=getEvidencePolicy()
  assert.equal(policy.maxPerActivity,null)
  assert.ok(policy.maxBytes>0);assert.ok(policy.maxPerItem>0)
})
