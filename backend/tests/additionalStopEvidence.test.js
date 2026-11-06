import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import express, { Router } from 'express'
import { Pool } from 'pg'
import { getEvidencePolicy, hasReadyItemEvidence, hasReadyActivityEvidence } from '../services/evidencePolicy.service.js'

test('visits and additional stops accept 25 photos, allow owner withdrawal and preserve execution and evidence policies', { skip: !process.env.TEST_ADMIN_DATABASE_URL }, async () => {
  const url = new URL(process.env.TEST_ADMIN_DATABASE_URL)
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(url.hostname))
  url.pathname = '/postgres'
  const admin = new Pool({ connectionString: url.toString(), max: 1 })
  const name = 'routes_extra_photos_' + randomUUID().replaceAll('-', '')
  let db, server, created = false
  try {
    await admin.query(`CREATE DATABASE "${name}"`); created = true
    url.pathname = '/' + name
    db = new Pool({ connectionString: url.toString(), max: 3 })
    await db.query(`CREATE TABLE personas(id uuid PRIMARY KEY);
      CREATE TABLE work_plan(id uuid PRIMARY KEY,supervisor_id uuid,status text,archived_at timestamptz);
      CREATE TABLE work_plan_item(id uuid PRIMARY KEY,plan_id uuid,item_type text,source text,status text,removed_at timestamptz);
      CREATE TABLE pharmacy_activity(id uuid PRIMARY KEY,plan_item_id uuid);
      CREATE TABLE operational_task(id uuid PRIMARY KEY);`)
    const migration = await readFile(new URL('../../supabase/migrations/20260917183000_pilot_evidence_tasks_director.sql', import.meta.url), 'utf8')
    const table = migration.match(/CREATE TABLE public\.visit_evidence \([\s\S]*?\n\);/)
    assert.ok(table); await db.query(table[0])
    const owner = randomUUID(), outsider = randomUUID(), plan = randomUUID(), stop = randomUUID(), pharmacy = randomUUID()
    await db.query('INSERT INTO personas VALUES($1),($2)', [owner, outsider])
    await db.query("INSERT INTO work_plan VALUES($1,$2,'APPROVED',NULL)", [plan, owner])
    await db.query("INSERT INTO work_plan_item VALUES($1,$3,'EXTRA_STOP','SUPERVISOR_ADHOC','DONE',NULL),($2,$3,'PHARMACY','PLAN','IN_PROGRESS',NULL)", [stop, pharmacy, plan])
    const uploaded = new Set()
    const storage = { from: () => ({
      createSignedUrl: async path => ({ data: { signedUrl: 'https://example.invalid/' + path } }),
      createSignedUploadUrl: async () => ({ data: { token: 'local-signed-ticket' } }),
      list: async (directory, options) => ({ data: uploaded.has(directory + '/' + options.search) ? [{ name: options.search }] : [] })
    }) }
    const source = (await readFile(new URL('../routes/mobile.evidence.route.js', import.meta.url), 'utf8'))
      .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g, '').replace(/export default router\s*$/, '')
    const context = vm.createContext({ Router, pool: db, getSupabaseAdmin: () => ({ storage }), getEvidencePolicy,
      canAccessPersona: async (actor, id) => actor.id === id, process: { env: { EVIDENCE_MAX_PER_ITEM: '10' } },
      console: { log() {}, info() {}, warn() {}, error() {} } })
    const router = vm.runInContext(source + '\nrouter', context)
    const app = express(); app.use(express.json())
    app.use((req, res, next) => {
      const id = req.headers['x-test-outsider'] ? outsider : owner
      req.profile = req.identityProfile = { id, area: 'FARMACIAS', rol: 'SUPERVISOR' }; next()
    })
    app.use('/evidence', router)
    app.use((error, req, res, next) => res.status(error.status || 500).json({ code: error.code, error: error.message }))
    server = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)) })
    const base = `http://127.0.0.1:${server.address().port}/evidence`
    const post = (route, body = {}, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    const payload = () => { const id = randomUUID(); return { evidenceId: id, idempotencyKey: id, capturedAt: new Date().toISOString(), latitude: 19, longitude: -98, accuracyM: 10, mocked: false, mimeType: 'image/jpeg', byteSize: 3 } }
    let first
    for (let i = 0; i < 25; i++) {
      const photo = payload(); first ??= photo
      const ticket = await post('/items/' + stop, photo)
      const body = await ticket.json(); assert.equal(ticket.status, 201, JSON.stringify(body))
      uploaded.add(body.upload.path)
      const completed = await post('/' + photo.evidenceId + '/complete')
      const confirmation = await completed.json(); assert.equal(completed.status, 200, JSON.stringify(confirmation))
      assert.equal(confirmation.evidence.status, 'READY')
    }
    assert.equal((await db.query("SELECT count(*)::int n FROM visit_evidence WHERE status='READY'")).rows[0].n, 25)
    assert.equal((await post('/items/' + stop, first)).status, 200)
    assert.equal((await db.query('SELECT count(*)::int n FROM visit_evidence')).rows[0].n, 25)
    assert.equal((await post('/items/' + stop, payload(), { 'x-test-outsider': '1' })).status, 404)
    assert.equal((await post('/' + first.evidenceId + '/complete', {}, { 'x-test-outsider': '1' })).status, 404)
    for (const invalid of [{ byteSize: 6291457 }, { mocked: true }, { mimeType: 'image/bmp' }]) {
      assert.equal((await post('/items/' + stop, { ...payload(), ...invalid })).status, 400)
    }
    let visitPhoto
    for (let i = 0; i < 25; i++) {
      const photo=payload(); visitPhoto ??=photo
      const response=await post('/items/'+pharmacy,photo)
      const body=await response.json(); assert.equal(response.status,201,JSON.stringify(body))
      uploaded.add(body.upload.path)
      assert.equal((await post('/'+photo.evidenceId+'/complete')).status,200)
    }
    const list=async id=>{const r=await fetch(base+'/items/'+id);assert.equal(r.status,200);return r.json()}
    assert.equal((await list(pharmacy)).evidence.length,25)
    assert.equal((await list(stop)).evidence.length,25)
    const remove=(item,id,headers={})=>fetch(base+'/items/'+item+'/'+id,{method:'DELETE',headers})
    assert.equal((await remove(stop,first.evidenceId,{'x-test-outsider':'1'})).status,404)
    assert.equal((await remove(stop,first.evidenceId)).status,200)
    const withdrawn=(await db.query('SELECT * FROM visit_evidence WHERE id=$1',[first.evidenceId])).rows[0]
    assert.equal(withdrawn.status,'REJECTED');assert.ok(withdrawn.uploaded_at);assert.equal(withdrawn.supervisor_id,owner)
    assert.equal((await remove(stop,first.evidenceId)).status,200)
    assert.equal((await db.query('SELECT updated_at FROM visit_evidence WHERE id=$1',[first.evidenceId])).rows[0].updated_at.getTime(),withdrawn.updated_at.getTime())
    assert.equal((await post('/items/'+stop,first)).status,409)
    assert.equal((await post('/'+first.evidenceId+'/complete')).status,409)
    assert.equal((await db.query('SELECT status FROM work_plan_item WHERE id=$1',[stop])).rows[0].status,'DONE')
    const after=await list(stop);assert.equal(after.evidence.length,24);assert.deepEqual(after.removedEvidenceIds,[first.evidenceId])
    assert.ok(after.evidence.every(photo=>photo.canRemove && photo.signedUrl))
    // Withdrawal races completion of an already uploaded object. No ordering may
    // restore the photo, and a last withdrawn photo no longer satisfies checkout.
    const race=payload(), ticket=await (await post('/items/'+pharmacy,race)).json();uploaded.add(ticket.upload.path)
    await Promise.all([post('/'+race.evidenceId+'/complete'),remove(pharmacy,race.evidenceId)])
    assert.equal((await db.query('SELECT status FROM visit_evidence WHERE id=$1',[race.evidenceId])).rows[0].status,'REJECTED')
    assert.equal((await remove(pharmacy,visitPhoto.evidenceId)).status,200)
    assert.equal((await list(pharmacy)).evidence.length,24)
    assert.equal((await remove(pharmacy,payload().evidenceId)).status,200) // local capture, no ticket yet
    assert.equal((await remove(randomUUID(),payload().evidenceId)).status,404)
    assert.equal((await remove(pharmacy,'bad-id')).status,400)
    const single=randomUUID(),activity=randomUUID()
    await db.query("INSERT INTO work_plan_item VALUES($1,$2,'PHARMACY','PLAN','DONE',NULL)",[single,plan])
    await db.query('INSERT INTO pharmacy_activity VALUES($1,$2)',[activity,single])
    const activityPhoto={...payload(),activityId:activity}
    const activityTicket=await (await post('/items/'+single,activityPhoto)).json();uploaded.add(activityTicket.upload.path)
    assert.equal((await post('/'+activityPhoto.evidenceId+'/complete')).status,200)
    assert.equal(await hasReadyItemEvidence(db,single),true)
    assert.equal(await hasReadyActivityEvidence(db,single,activity),true)
    await remove(single,activityPhoto.evidenceId)
    assert.equal(await hasReadyItemEvidence(db,single),false)
    assert.equal(await hasReadyActivityEvidence(db,single,activity),false)
    const replacement={...payload(),activityId:activity}
    const replacementTicket=await (await post('/items/'+single,replacement)).json();uploaded.add(replacementTicket.upload.path)
    assert.equal((await post('/'+replacement.evidenceId+'/complete')).status,200)
    assert.equal(await hasReadyActivityEvidence(db,single,activity),true)
    assert.equal((await db.query('SELECT status FROM work_plan_item WHERE id=$1',[single])).rows[0].status,'DONE')
    assert.equal(getEvidencePolicy().maxPerItem,null)
    assert.equal(getEvidencePolicy().maxPerExtraStop,null)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    if (db) await db.end()
    try { if (created) await admin.query(`DROP DATABASE "${name}"`) } finally { await admin.end() }
  }
})
