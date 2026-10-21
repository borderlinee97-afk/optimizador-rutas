import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'

process.env.DATABASE_URL ??= 'postgresql://localhost/unused_test_only'
const {applyOfflineVisitEvent,parseOfflineEvent}=await import('../services/offlineVisitExecution.service.js')

const event=()=>({id:randomUUID(),itemId:randomUUID(),action:'ACTIVITY_ADDED',activityId:randomUUID(),activityType:'Inventario adicional',note:'Observación',occurredAt:new Date().toISOString()})
test('activity creation validates the ID, description, note and capture time',()=>{
  const input=event(),parsed=parseOfflineEvent({...input,activityType:'  Conteo  ',note:'  Diferencia  '})
  assert.equal(parsed.activityType,'Conteo');assert.equal(parsed.note,'Diferencia')
  for(const value of [{activityId:'invalid'},{activityType:' '},{activityType:'x'.repeat(161)},{note:'x'.repeat(1001)},{note:{}},{occurredAt:'2020-01-01'}])assert.throws(()=>parseOfflineEvent({...input,...value}))
})

test('additional activities append atomically, enforce permissions and active visit, and retries never duplicate them',
 {skip:!process.env.TEST_ADMIN_DATABASE_URL},async t=>{
  const url=new URL(process.env.TEST_ADMIN_DATABASE_URL)
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname))
  url.pathname='/postgres'
  const admin=new Pool({connectionString:url.toString(),max:1}),name='codex_visit_add_'+randomUUID().replaceAll('-','').slice(0,12)
  const ids=Object.fromEntries(['actor','auth','other','plan','item','original'].map(key=>[key,randomUUID()]))
  let db,created=false
  try {
    await admin.query('CREATE DATABASE "'+name+'"');created=true
    url.pathname='/'+name;db=new Pool({connectionString:url.toString(),max:4})
    await db.query(`CREATE TABLE personas(id uuid PRIMARY KEY,auth_user_id uuid,activo boolean,area text,rol text);
      CREATE TABLE work_plan(id uuid PRIMARY KEY,approved_at timestamptz,status text,archived_at timestamptz);
      CREATE TABLE work_plan_item(id uuid PRIMARY KEY,plan_id uuid,supervisor_id uuid,status text,item_type text,source text,check_in_at timestamptz,scheduled_date date,cancellation_request_status text);
      CREATE TABLE work_plan_event(id uuid PRIMARY KEY,plan_id uuid,entity_type text,entity_id uuid,revision_number integer,event_type text,actor_id uuid,actor_area text,actor_role text,previous_status text,new_status text,metadata jsonb);`)
    const schema=await readFile(new URL('../../supabase/migrations/20260917181330_remote_schema.sql',import.meta.url),'utf8')
    await db.query(schema.match(/CREATE TABLE "public"\."pharmacy_activity" \([\s\S]*?\n\);/)[0])
    await db.query(await readFile(new URL('../../supabase/migrations/20260917182000_pharmacy_activity_execution.sql',import.meta.url),'utf8'))
    await db.query("INSERT INTO personas VALUES($1,$2,true,'FARMACIAS','SUPERVISOR')",[ids.actor,ids.auth])
    await db.query("INSERT INTO work_plan VALUES($1,now()-interval '1 hour','APPROVED',NULL)",[ids.plan])
    await db.query("INSERT INTO work_plan_item VALUES($1,$2,$3,'IN_PROGRESS','PHARMACY','PLAN',now()-interval '10 minutes',current_date,NULL)",[ids.item,ids.plan,ids.actor])
    await db.query("INSERT INTO pharmacy_activity(id,plan_item_id,activity_type,ord,status,created_by,completed_by,completed_at) VALUES($1,$2,'Planeada ya realizada',1,'DONE',$3,$3,now())",[ids.original,ids.item,ids.actor])
    const profile={id:ids.actor,activo:true,area:'FARMACIAS',rol:'SUPERVISOR'}
    const helpers={
      async getLockedOwnedItem(client,id,owner){const r=await client.query("SELECT *, 'APPROVED' AS plan_status,1 AS revision_number FROM work_plan_item WHERE id=$1 AND supervisor_id=$2 FOR UPDATE",[id,owner]);return r.rows[0]},
      async getCompletePlanItem(client,id){return(await client.query('SELECT * FROM work_plan_item WHERE id=$1',[id])).rows[0]},
      mapPlanItem:row=>({id:row.id,status:row.status}),
    }
    const make=()=>({...event(),itemId:ids.item})
    const apply=(input,extra={})=>applyOfflineVisitEvent({profile,authUserId:ids.auth,input,helpers,db,...extra})
    const before=(await db.query('SELECT * FROM pharmacy_activity WHERE id=$1',[ids.original])).rows[0]
    const first=make()
    await t.test('append preserves planned content, owner, status and evidence requirements',async()=>{
      const result=await apply(first)
      assert.equal(result.activities.length,2)
      const added=result.activities.find(a=>a.id===first.activityId)
      assert.equal(added.status,'PENDING');assert.equal(added.order,2);assert.equal(added.createdBy,ids.actor)
      assert.deepEqual((await db.query('SELECT * FROM pharmacy_activity WHERE id=$1',[ids.original])).rows[0],before)
      assert.equal((await db.query('SELECT event_type FROM work_plan_event WHERE id=$1',[first.id])).rows[0].event_type,'OFFLINE_ACTIVITY_ADDED')
    })
    await t.test('retry returns the same receipt, changed payload and reused activity ID are rejected',async()=>{
      await apply(first);assert.equal((await db.query('SELECT count(*)::int n FROM pharmacy_activity')).rows[0].n,2)
      await assert.rejects(apply({...first,note:'Changed'}),{code:'OFFLINE_IDEMPOTENCY_CONFLICT'})
      await assert.rejects(apply({...make(),activityId:first.activityId}),{code:'VISIT_ACTIVITY_ID_CONFLICT'})
    })
    await t.test('wrong authentication, wrong owner and nonexecuting visit cannot add',async()=>{
      await assert.rejects(apply(make(),{authUserId:ids.other}),{code:'PROFILE_INACTIVE'})
      await assert.rejects(apply({...make(),itemId:ids.other}),{code:'PLAN_ITEM_NOT_FOUND'})
      for(const status of ['PENDING','DONE','CANCELLED']){
        await db.query('UPDATE work_plan_item SET status=$1',[status])
        await assert.rejects(apply(make()),{code:'ITEM_NOT_IN_PROGRESS'})
      }
      await db.query("UPDATE work_plan_item SET status='IN_PROGRESS',source='HIERARCHY_ASSIGNED'")
      await assert.rejects(apply(make()),{code:'VISIT_ACTIVITIES_NOT_ALLOWED_FOR_EXTRA_STOP'})
      await db.query("UPDATE work_plan_item SET source='PLAN',cancellation_request_status='PENDING'")
      await assert.rejects(apply(make()),{code:'CANCELLATION_REQUEST_PENDING'})
      await db.query("UPDATE work_plan_item SET cancellation_request_status=NULL")
    })
    await t.test('parallel captures append in order without replacing planned activities',async()=>{
      await Promise.all([apply(make()),apply(make())])
      assert.deepEqual((await db.query('SELECT ord FROM pharmacy_activity ORDER BY ord')).rows.map(r=>r.ord),[1,2,3,4])
    })
    await t.test('fifty activity limit rolls back creation and audit receipt together',async()=>{
      await db.query("INSERT INTO pharmacy_activity(plan_item_id,activity_type,ord,created_by) SELECT $1,'Planeada',n,$2 FROM generate_series(5,50) n",[ids.item,ids.actor])
      const input=make();await assert.rejects(apply(input),{code:'TOO_MANY_VISIT_ACTIVITIES'})
      assert.equal((await db.query('SELECT count(*)::int n FROM pharmacy_activity')).rows[0].n,50)
      assert.equal((await db.query('SELECT id FROM work_plan_event WHERE id=$1',[input.id])).rowCount,0)
    })
  } finally {
    if(db)await db.end()
    if(created)await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)')
    await admin.end()
  }
})
