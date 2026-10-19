const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { DatabaseSync } = require('node:sqlite')

const source = fs.readFileSync(require.resolve('../routes/mobile.workPlanCatalog.route.js'),'utf8')
  .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export default router\s*$/,'')

async function request(query = {}) {
  const routes = [], calls = [], db = new DatabaseSync(':memory:')
  db.function('BTRIM', value => value.trim())
  db.exec('CREATE TABLE farmacia(id INTEGER,lugar_farmacia TEXT,accessible BOOLEAN)')
  const insert = db.prepare('INSERT INTO farmacia VALUES(?,?,?)')
  for(let i=1;i<=51;i++) insert.run(i,i===1?null:'URBANA',1)
  insert.run(70,' almacenes ',1)
  insert.run(71,'ALMACENES',0)
  const context = {
    Router: () => ({ use() {}, get(path,handler) { routes.push({path,handler}) } }), requireAuth() {},
    normalizePharmacyScopeMode: value => value ?? 'ASSIGNED_ONLY',
    pool: { query: async (sql, params) => {
      calls.push({sql,params})
      const start = sql.indexOf('AND (\n            $10::text IS NULL')
      const end = sql.indexOf('ORDER BY',start)
      assert.ok(start>0 && end>start && end<sql.indexOf('LIMIT $6'))
      const condition=sql.slice(start,end).replace(/::text/g,'').replace(/\$10/g,':kind')
      const rows = db.prepare(`SELECT *,COUNT(*) OVER() AS total_count FROM farmacia WHERE accessible=1 ${condition} ORDER BY id LIMIT :limit OFFSET :offset`)
        .all({kind:params[9],limit:params[5],offset:params[6]})
      return {rows,rowCount:rows.length}
    } }, console,
  }
  vm.runInNewContext(source,context)
  const result = {status:200,body:null}
  const res = { status(code) {result.status=code;return this}, json(body) {result.body=body;return body} }
  try {
    await routes.find(r=>r.path==='/pharmacies').handler({query,profile:{id:'supervisor',rol:'SUPERVISOR',pharmacy_scope_mode:'ASSIGNED_ONLY'}},res)
    return {...result,calls}
  } finally {db.close()}
}

test('CEDIS filter precedes pagination and excludes inaccessible warehouses',async()=>{
  const r=await request({kind:'CEDIS'})
  assert.equal(r.status,200)
  assert.equal(r.body.pharmacies.length,1)
  assert.equal(String(r.body.pharmacies[0].id),'70')
  assert.equal(r.body.pagination.total,1)
  assert.equal(r.calls[0].params[8],'ASSIGNED_ONLY')
})
test('units exclude warehouses and retain null-location pharmacies and original pagination',async()=>{
  const r=await request({kind:'UNITS'})
  assert.equal(r.status,200)
  assert.equal(r.body.pharmacies.length,30)
  assert.equal(r.body.pagination.total,51)
  assert.equal(String(r.body.pharmacies[0].id),'1')
})
test('existing clients without kind retain their mixed catalog',async()=>{
  const r=await request({limit:'100'})
  assert.equal(r.status,200)
  assert.equal(r.body.pagination.total,52)
  assert.equal(r.calls[0].params[9],null)
})
test('unknown kind returns 400 before querying data',async()=>{
  const r=await request({kind:'ALL_PROJECTS'})
  assert.equal(r.status,400)
  assert.equal(r.body.code,'PHARMACY_KIND_INVALID')
  assert.equal(r.calls.length,0)
})
