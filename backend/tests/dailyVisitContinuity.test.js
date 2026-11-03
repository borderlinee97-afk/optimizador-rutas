import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import {Pool} from 'pg'
import {listOverdueVisits} from '../services/overdueVisits.service.js'
import {buildReport,validateReportFilters} from '../services/farmaciasReporting.service.js'
process.env.DATABASE_URL ??= 'postgresql://localhost/unused_test_only'
const {applyOfflineVisitEvent}=await import('../services/offlineVisitExecution.service.js')
const sqlFile=async name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')

test('daily continuity and scoped review alerts on real disposable PostgreSQL', {skip:!process.env.TEST_ADMIN_DATABASE_URL}, async t=>{
 const url=new URL(process.env.TEST_ADMIN_DATABASE_URL)
 assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname))
 url.pathname='/postgres';const control=new Pool({connectionString:url.toString(),max:1}),name='codex_daily_'+randomUUID().replaceAll('-','')
 let db,created=false
 try {
  await control.query('CREATE DATABASE "'+name+'"');created=true;url.pathname='/'+name;db=new Pool({connectionString:url.toString(),max:5})
  await db.query(`CREATE TABLE personas(id uuid PRIMARY KEY,nombre text,rol text,area text,activo boolean,superior_id uuid,auth_user_id uuid);
   CREATE TABLE person_state_scope(persona_id uuid,estado text,revoked_at timestamptz);
   CREATE TABLE puebla_supervisor_coordinator(coordinator_id uuid,supervisor_id uuid,revoked_at timestamptz);
   CREATE TABLE farmacia(id bigint PRIMARY KEY,unidad text);`)
  const schema=await sqlFile('20260917181330_remote_schema.sql')
  for(const table of ['work_plan','work_plan_item','work_plan_revision','work_plan_event','pharmacy_activity']) await db.query(schema.match(new RegExp('CREATE TABLE "public"\\."'+table+'" \\([\\s\\S]*?\\n\\);'))[0])
  for(const file of ['20260917182800_work_plan_item_execution.sql','20260917182000_pharmacy_activity_execution.sql','20260917182100_visit_geofence_attempt.sql']) await db.query(await sqlFile(file))
  for(const [file,fn] of [['20261018120000_puebla_shared_reporting_availability.sql','puebla_shared_supervisor'],['20261019140000_plan_approvals_notifications.sql','can_review_farmacias_plan']]) await db.query((await sqlFile(file)).match(new RegExp('CREATE FUNCTION public\\.'+fn+'\\([\\s\\S]*?\\$\\$;'))[0])
  const people={}
  for(const [key,role,parent,state] of [['manager','GERENTE',null,'Puebla'],['coordA','COORDINADOR','manager','Puebla'],['coordB','COORDINADOR','manager','Puebla'],['supervisor','SUPERVISOR','coordA','Puebla'],['outsider','COORDINADOR',null,'Jalisco']]) {
   const person={id:randomUUID(),auth:randomUUID(),nombre:key,activo:true,rol:role,area:'FARMACIAS'};people[key]=person
   await db.query('INSERT INTO personas VALUES($1,$2,$3,$4,true,$5,$6)',[person.id,key,role,'FARMACIAS',people[parent]?.id??null,person.auth])
   await db.query('INSERT INTO person_state_scope VALUES($1,$2,NULL)',[person.id,state])
  }
  for(const c of ['coordA','coordB'])await db.query('INSERT INTO puebla_supervisor_coordinator VALUES($1,$2,NULL)',[people[c].id,people.supervisor.id])
  const today=(await db.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date::text AS day")).rows[0].day
  const yesterday=new Date(Date.parse(today+'T12:00Z')-86400000).toISOString().slice(0,10)
  const oldTime=yesterday+'T18:00:00Z',plan=randomUUID()
  await db.query("INSERT INTO work_plan(id,supervisor_id,status,week_start,period_start,period_end,plan_type,approved_at,created_by) VALUES($1,$2,'APPROVED',$3,$3,$4,'ORDINARY',$3::date::timestamp AT TIME ZONE 'America/Mexico_City',$2)",[plan,people.supervisor.id,yesterday,today])
  async function item(date,status='PENDING',ownerPlan=plan) {
   const id=randomUUID();await db.query("INSERT INTO work_plan_item(id,plan_id,item_type,source,custom_name,custom_lat,custom_lng,status,scheduled_date,check_in_at) VALUES($1,$2,'EXTRA_STOP','SUPERVISOR_ADHOC','Destino',19,-98,$3,$4,CASE WHEN $3='IN_PROGRESS' THEN $5::timestamptz END)",[id,ownerPlan,status,date,date===today?new Date().toISOString():oldTime]);return id
  }
  const old=await item(yesterday,'IN_PROGRESS'),missed=await item(yesterday),one=await item(today),two=await item(today)
  const profile=people.supervisor
  const helpers={
   async getLockedOwnedItem(client,id,owner){return(await client.query("SELECT i.*,p.status AS plan_status,1 AS revision_number,(i.scheduled_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date) AS is_today FROM work_plan_item i JOIN work_plan p ON p.id=i.plan_id WHERE i.id=$1 AND p.supervisor_id=$2 FOR UPDATE OF i",[id,owner])).rows[0]},
   async getCompletePlanItem(client,id){return(await client.query('SELECT *,custom_lat AS lat,custom_lng AS lng FROM work_plan_item WHERE id=$1',[id])).rows[0]},
   mapPlanItem:row=>({id:row.id,status:row.status}),
  }
  const make=id=>({id:randomUUID(),itemId:id,action:'CHECK_IN',occurredAt:new Date().toISOString(),lat:19,lng:-98,accuracyM:5})
  const apply=input=>applyOfflineVisitEvent({profile,authUserId:profile.auth,input,helpers,db})
  const original=(await db.query('SELECT * FROM work_plan_item WHERE id=$1',[old])).rows[0]
  await t.test('today starts offline despite an older open visit; retry is idempotent and yesterday stays untouched',async()=>{
   const event=make(one);await apply(event);await apply(event)
   assert.deepEqual((await db.query('SELECT * FROM work_plan_item WHERE id=$1',[old])).rows[0],original)
   assert.equal((await db.query('SELECT count(*)::int n FROM work_plan_event WHERE id=$1',[event.id])).rows[0].n,1)
   await assert.rejects(apply(make(two)),{code:'ACTIVE_VISIT_EXISTS'})
   await assert.rejects(apply(make(missed)),{code:'ITEM_NOT_SCHEDULED_TODAY'})
  })
  await t.test('online check-in uses the same day guard and keeps prior records',async()=>{
   await db.query("UPDATE work_plan_item SET status='PENDING',check_in_at=NULL WHERE id=$1",[one])
   const routes=[],source=(await readFile(new URL('../routes/mobile.farmacias.route.js',import.meta.url),'utf8')).replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export default router\s*$/,'')
   const ctx={pool:db,console,requireAuth(){},Router:()=>({use(){},get(){},post(path,...handlers){routes.push({path,handler:handlers.at(-1)})}})}
   vm.runInNewContext(source,ctx);Object.assign(ctx,helpers)
   const run=async id=>{const res={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await routes.find(r=>r.path==='/items/:itemId/check-in').handler({params:{itemId:id},profile,body:{lat:19,lng:-98}},res);return res}
   assert.equal((await run(one)).statusCode,201)
   const blocked=await run(two);assert.equal(blocked.statusCode,409);assert.equal(blocked.body.code,'ACTIVE_VISIT_EXISTS')
   assert.deepEqual((await db.query('SELECT * FROM work_plan_item WHERE id=$1',[old])).rows[0],original)
  })
  await t.test('concurrent starts serialize; only one visit today wins alongside the old visit',async()=>{
   await db.query("UPDATE work_plan_item SET status='PENDING',check_in_at=NULL WHERE id=ANY($1::uuid[])",[[one,two]])
   const results=await Promise.allSettled([apply(make(one)),apply(make(two))])
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
   assert.equal(results.find(r=>r.status==='rejected').reason.code,'ACTIVE_VISIT_EXISTS')
  })
  await t.test('both Puebla coordinators see unresolved days, outsiders and revoked/inactive coordinators do not',async()=>{
   for(const c of ['coordA','coordB']){const alerts=await listOverdueVisits(db,people[c]);assert.equal(alerts.total,2);assert.deepEqual(alerts.visits.map(v=>v.reason).sort(),['No realizada','Sin finalizar']);assert.ok(alerts.visits.every(v=>v.requiresReview&&v.scheduledDate===yesterday))}
   assert.equal((await listOverdueVisits(db,people.outsider)).total,0)
   assert.equal((await listOverdueVisits(db,{...people.coordB,activo:false})).total,0)
   await db.query('UPDATE puebla_supervisor_coordinator SET revoked_at=now() WHERE coordinator_id=$1',[people.coordB.id]);assert.equal((await listOverdueVisits(db,people.coordB)).total,0)
   await db.query('UPDATE puebla_supervisor_coordinator SET revoked_at=NULL')
  })
  await t.test('web inbox and mobile alert endpoint return the same scoped count without inventing approval decisions',async()=>{
   for(const file of ['web.approvals.route.js','mobile.workPlanApprovals.route.js']) {
    const routes=[],source=(await readFile(new URL('../routes/'+file,import.meta.url),'utf8')).replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export default router\s*$/,'')
    const ctx={pool:db,console,listOverdueVisits,requireAuth(){},isActiveAdmin:()=>false,listEditRequests:async()=>({requests:[]}),Router:()=>({use(){},get(path,...handlers){routes.push({path,handler:handlers.at(-1)})},post(){}})}
    vm.runInNewContext(source,ctx)
    for(const name of ['getPendingPlans','getPendingCancellations','getPendingCoverages'])ctx[name]=async()=>({rows:[]})
    const res={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this}}
    await routes.find(r=>r.path===(file.startsWith('web')?'/':'/execution-alerts')).handler({profile:people.coordB},res)
    assert.equal(res.statusCode,200)
    if(file.startsWith('web')){assert.equal(res.body.counts.reviewRequired,2);assert.equal(res.body.counts.total,0);assert.equal(res.body.executionAlerts.total,2)}
    else assert.equal(res.body.total,2)
   }
  })
  await t.test('coordinator unfinished visits alert only their manager; terminal/removed visits are excluded and archiving cannot hide an unresolved approved visit',async()=>{
   const cp=randomUUID();await db.query("INSERT INTO work_plan(id,supervisor_id,status,week_start,period_start,period_end,plan_type,approved_at,created_by) VALUES($1,$2,'APPROVED',$3,$3,$4,'EXTRAORDINARY',now(),$2)",[cp,people.coordA.id,yesterday,today]);await item(yesterday,'PENDING',cp)
   assert.equal((await listOverdueVisits(db,people.coordB)).total,2)
   assert.equal((await listOverdueVisits(db,people.manager)).total,3)
   await db.query("UPDATE work_plan_item SET status='SKIPPED' WHERE id=$1",[missed]);assert.equal((await listOverdueVisits(db,people.coordA)).total,1)
   await db.query('UPDATE work_plan_item SET removed_at=now() WHERE id=$1',[old]);assert.equal((await listOverdueVisits(db,people.coordA)).total,0)
   await db.query("UPDATE work_plan SET status='ARCHIVED',archived_at=now() WHERE id=$1",[cp]);assert.equal((await listOverdueVisits(db,people.manager)).total,1)
   await db.query('UPDATE work_plan SET approved_at=NULL WHERE id=$1',[cp]);assert.equal((await listOverdueVisits(db,people.manager)).total,0)
  })
 } finally {if(db)await db.end();if(created)await control.query('DROP DATABASE "'+name+'" WITH (FORCE)');await control.end()}
})

test('report flags overdue pending and open visits without granting completion, time or coverage',()=>{
 const rows=[['PENDING',null],['IN_PROGRESS','2020-01-01T18:00Z'],['DONE','2020-01-01T18:00Z'],['CANCELLED',null]].map(([status,check_in_at],i)=>({id:String(i),plan_id:'p',person_id:'a',person_name:'A',name:'Unidad',status,source:'PLAN',scheduled_date:'2020-01-01',check_in_at,check_out_at:null}))
 const result=buildReport({people:[{id:'a',name:'A',coordinatorIds:[],coordinatorNames:[]}],assignments:[],coverages:[],vacations:[],visits:rows},validateReportFilters({startDate:'2020-01-01',endDate:'2020-01-02'}))
 assert.equal(result.summary.overdueVisits,2);assert.equal(result.summary.completedVisits,0);assert.equal(result.summary.effectiveSeconds,0);assert.equal(result.summary.servicedAssigned,0)
 assert.equal(result.visits.filter(v=>v.requiresReview).length,2)
})
