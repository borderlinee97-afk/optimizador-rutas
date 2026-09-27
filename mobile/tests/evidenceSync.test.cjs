const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('../node_modules/typescript')

function harness(options = {}) {
  const row = { evidence_id: 'e1', plan_item_id: 'visit', local_uri: 'file:///documents/photo.jpg',
    mime_type: 'image/jpeg', byte_size: 3, status: options.status ?? 'PENDING', attempts: 0 }
  const calls = []
  class ApiError extends Error { constructor(message, status) { super(message); this.status = status } }
  const ticket = { ok: true, evidence: { id: 'e1', status: 'READY' }, upload: { path: 'p', token: 'signed' } }
  const db = {
    getAllSync: (_sql, args) => row.status !== 'FAILED' || args?.[0] ? [row] : [],
    runSync(sql, args) {
      if (sql.includes("status = 'UPLOADING'")) row.status = 'UPLOADING'
      if (sql.includes("status = 'READY'")) row.status = 'READY'
      if (sql.includes('attempts = attempts + 1')) {
        row.status = args[0]; row.last_error = args[1]; row.attempts++
      }
    },
  }
  const session = { access_token: 'fresh', expires_at: Date.now() / 1000 + (options.expired ? -10 : 3600) }
  const modules = {
    '../../storage/db': { db }, 'react-native': { Platform: { OS: 'android' } },
    'expo-file-system': { File: class { async arrayBuffer() {
      calls.push('file'); if (options.missing) throw new Error('missing')
      return new Uint8Array([1, 2, 3]).buffer
    } } },
    '../lib/api': { ApiError,
      createVisitEvidenceTicket: async (_id, _payload, token) => {
        calls.push(token); if (options.http) throw new ApiError('denied', options.http)
        return ticket
      },
      completeEvidenceUpload: async () => {
        calls.push('complete'); if (options.confirmationError) throw new Error('network')
        return { ...ticket, evidence: { id: 'e1', status: options.unconfirmed ? 'PENDING' : 'READY' } }
      },
    },
    '../lib/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session } }), refreshSession: async () => {
        calls.push('refresh'); return { data: { session: { ...session, access_token: 'renewed' } } }
      } },
      storage: { from: () => ({ uploadToSignedUrl: async (_path, _token, body) => {
        calls.push('storage'); assert.equal(body.byteLength, 3)
        return { error: options.storageError ? new Error('network') : null }
      } }) },
    } },
  }
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/services/evidenceSync.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(source, { exports, require: name => modules[name], Date, Error, Uint8Array })
  return { row, calls, sync: exports.syncPendingEvidence }
}

test('native bytes reach Storage and READY requires backend confirmation', async () => {
  const h = harness(); await h.sync('stale')
  assert.equal(h.row.status, 'READY'); assert.deepEqual(h.calls, ['fresh', 'file', 'storage', 'complete'])
})
for (const options of [{ storageError: true }, { confirmationError: true }, { unconfirmed: true }, { http: 401 }]) {
  test(`recoverable failure preserves pending data: ${JSON.stringify(options)}`, async () => {
    const h = harness(options); await h.sync('stale')
    assert.equal(h.row.status, 'PENDING'); assert.equal(h.row.attempts, 1)
    assert.ok(h.row.last_error); assert.equal(h.row.local_uri, 'file:///documents/photo.jpg')
  })
}
test('403 stops automatic retries and allows one attempt per manual trigger', async () => {
  const h = harness({ http: 403 }); await h.sync('token'); assert.equal(h.row.status, 'FAILED')
  await h.sync('token'); assert.equal(h.row.attempts, 1)
  await h.sync('token', true); assert.equal(h.row.attempts, 2)
})
test('missing file stops automatic retries without deleting the record', async () => {
  const h = harness({ missing: true }); await h.sync('token')
  assert.equal(h.row.status, 'FAILED'); assert.match(h.row.last_error, /LOCAL_FILE/)
})
test('expired session is renewed before obtaining the ticket', async () => {
  const h = harness({ expired: true }); await h.sync('stale')
  assert.deepEqual(h.calls.slice(0, 2), ['refresh', 'renewed'])
})
test('concurrent triggers share a single upload', async () => {
  const h = harness(); const first = h.sync('token'); assert.equal(first, h.sync('token')); await first
  assert.equal(h.calls.filter(c => c === 'storage').length, 1)
})
test('manual retry processes FAILED; restart resumes UPLOADING', async () => {
  for (const status of ['FAILED', 'UPLOADING']) {
    const h = harness({ status }); await h.sync('token', status === 'FAILED'); assert.equal(h.row.status, 'READY')
  }
})
