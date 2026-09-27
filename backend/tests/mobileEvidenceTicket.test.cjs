const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync(require.resolve('../routes/mobile.evidence.route.js'), 'utf8')
const ticketSource = source.slice(
  source.indexOf('async function createUploadTicket('),
  source.indexOf('async function lockEvidenceTarget('),
)

function harness({ status = 'PENDING_UPLOAD', mimeType = 'image/jpeg', reason = null } = {}) {
  const row = {
    id: 'evidence', idempotency_key: 'key', supervisor_id: 'owner',
    plan_item_id: 'item', activity_id: null, task_id: null,
    mime_type: mimeType, byte_size: 10, status, rejection_reason: reason,
    storage_path: 'owner/visits/item/evidence.jpg',
  }
  const queries = []
  let signed = 0
  const client = {
    async query(sql, params) {
      queries.push(sql)
      if (sql.includes('WHERE idempotency_key =')) return { rows: [row] }
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
    enforceEvidenceLimits: async () => {},
    createSignedUploadTicket: async () => { signed++; return { token: 'signed' } },
    mapEvidence: evidence => ({ byteSize: evidence.byte_size, status: evidence.status }),
    STALE_PENDING_UPLOAD_REASON: 'stale',
    DEFAULT_PENDING_UPLOAD_TTL_MINUTES: 120,
    process: { env: {} },
  }
  const createUploadTicket = vm.runInNewContext(`${ticketSource}\ncreateUploadTicket`, context)
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
  const target = { ownerId: 'owner', planItemId: 'item', activityId: null, taskId: null }
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
