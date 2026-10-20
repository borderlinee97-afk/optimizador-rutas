const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const {randomUUID} = require('node:crypto')
const {Pool} = require('pg')

// Explicit local-only opt-in. All tables are created in a disposable database.
test('Farmacias uses Guadalajara calendar for real SQL extra-stop create/edit/cancel', {
  skip: !process.env.TEST_ADMIN_DATABASE_URL,
}, async t => {
  const url = new URL(process.env.TEST_ADMIN_DATABASE_URL)
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname))
  url.pathname='/postgres'
  const admin=new Pool({connectionString:url.toString(),max:1})
  const name='codex_timezone_test_'+randomUUID().replaceAll('-','').slice(0,12)
  let db,created=false
  try {
    await admin.query(`CREATE DATABASE "${name}"`);created=true
    url.pathname='/'+name;db=new Pool({connectionString:url.toString(),max:2})
    const schema=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260917181330_remote_schema.sql'),'utf8')
    for(const table of ['work_plan','work_plan_item']) {
      const block=schema.match(new RegExp('CREATE TABLE "public"\\."'+table+'" \\([\\s\\S]*?\\n\\);'))
      assert.ok(block);await db.query(block[0])
    }
    await db.query(`ALTER TABLE work_plan_item ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
      ADD COLUMN IF NOT EXISTS check_out_at timestamptz,ADD COLUMN IF NOT EXISTS check_in_lat double precision,
      ADD COLUMN IF NOT EXISTS check_in_lng double precision,ADD COLUMN IF NOT EXISTS check_out_lat double precision,
      ADD COLUMN IF NOT EXISTS check_out_lng double precision,ADD COLUMN IF NOT EXISTS notes text,
      ADD COLUMN IF NOT EXISTS skip_reason text`)
    const routeSource=fs.readFileSync(path.join(__dirname,'../routes/mobile.extraStops.route.js'),'utf8')
      .replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export default router\s*$/,'')
    let clock='2026-10-20T01:00:00Z'
    const routes=[],errors=[]
    const context={Date,console:{error(...args){errors.push(args)}},requireAuth(){},
      Router:()=>({use(){},post(p,h){routes.push({method:'POST',path:p,h})},patch(p,h){routes.push({method:'PATCH',path:p,h})}}),
      pool:{connect:async()=>{
        const client=await db.connect()
        await client.query("SET TIME ZONE 'UTC'")
        return {query:(sql,params)=>client.query(sql.replace(/\bCURRENT_TIMESTAMP\b|NOW\(\)/g,`TIMESTAMPTZ '${clock}'`),params),release:()=>client.release()}
      }}}
    vm.runInNewContext(routeSource,context)
    const payload={name:'Fixture extra stop',address:'Fixture',lat:20.5,lng:-103.2,category:'OTHER',reason:'Local calendar regression',estimatedMinutes:15}
    async function request(method,route,owner,body,itemId) {
      const res={statusCode:200,status(c){this.statusCode=c;return this},json(value){this.body=value;return this}}
      await routes.find(x=>x.method===method&&x.path===route).h({profile:{id:owner},params:{itemId},body},res)
      return res
    }
    const cases=[
      ['2026-10-20T00:01:00Z','2026-10-19'],
      ['2026-10-20T05:59:59Z','2026-10-19'],
      ['2026-10-20T06:00:00Z','2026-10-20'],
      ['2026-10-19T05:59:59Z','2026-10-18'],
      ['2026-11-01T05:59:59Z','2026-10-31'],
      ['2026-01-01T05:59:59Z','2025-12-31'],
    ]
    for(const [instant,day] of cases) await t.test(instant+' -> '+day,async()=>{
      clock=instant
      const owner=randomUUID(),plan=randomUUID()
      await db.query("INSERT INTO work_plan(id,supervisor_id,status,week_start,period_start,period_end,created_by) VALUES($1,$2,'APPROVED',$3,$3,$3,$2)",[plan,owner,day])
      await db.query('INSERT INTO work_plan_item(plan_id,scheduled_date,ord) VALUES($1,$2,3),($1,($2::date+1),50)',[plan,day])
      const added=await request('POST','/',owner,payload)
      assert.equal(added.statusCode,201,JSON.stringify(added.body))
      assert.equal(added.body.item.scheduledDate,day)
      assert.equal(added.body.item.order,4)
      const id=added.body.item.id
      const edited=await request('PATCH','/:itemId',owner,{...payload,name:'Updated fixture'},id)
      assert.equal(edited.statusCode,200,JSON.stringify(edited.body))
      const cancelled=await request('POST','/:itemId/cancel',owner,{reason:'DUPLICATE_STOP'},id)
      assert.equal(cancelled.statusCode,200,JSON.stringify(cancelled.body))
      const state=await db.query('SELECT status FROM work_plan_item WHERE id=$1',[id])
      assert.equal(state.rows[0].status,'CANCELLED')
    })
    await t.test('day expression remains independent of database session timezone',async()=>{
      for(const zone of ['UTC','America/Los_Angeles','Asia/Tokyo']) {
        const client=await db.connect()
        try {
          await client.query('SELECT set_config(\'TimeZone\',$1,false)',[zone])
          const r=await client.query("SELECT ((TIMESTAMPTZ '2026-10-20T01:00:00Z' AT TIME ZONE 'America/Mexico_City')::date)::text AS day")
          assert.equal(r.rows[0].day,'2026-10-19')
        } finally {client.release()}
      }
    })
    await t.test('previous-day extra stops are still refused after real Guadalajara midnight',async()=>{
      const owner=randomUUID(),plan=randomUUID()
      clock='2026-10-20T05:59:59Z'
      await db.query("INSERT INTO work_plan(id,supervisor_id,status,week_start,period_start,period_end,created_by) VALUES($1,$2,'APPROVED','2026-10-19','2026-10-19','2026-10-25',$2)",[plan,owner])
      const added=await request('POST','/',owner,payload)
      assert.equal(added.statusCode,201)
      clock='2026-10-20T06:00:00Z'
      assert.equal((await request('PATCH','/:itemId',owner,payload,added.body.item.id)).statusCode,409)
      assert.equal((await request('POST','/:itemId/cancel',owner,{reason:'DUPLICATE_STOP'},added.body.item.id)).statusCode,409)
    })
    assert.equal(errors.length,0,JSON.stringify(errors))
  } finally {
    if(db)await db.end()
    if(created){assert.match(name,/^codex_timezone_test_[a-f0-9]{12}$/);await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`)}
    await admin.end()
  }
})
