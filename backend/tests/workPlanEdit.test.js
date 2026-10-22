import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Pool} from 'pg'
import {editToday,assertEditDates,assertUnstartedItem,getEditAccess,changeEditRequest,listEditRequests,attachEditAuthorization} from '../services/workPlanEdit.service.js'

test('editing uses Guadalajara midnight and protects both original and destination dates',()=>{
  assert.equal(editToday(new Date('2026-10-23T05:59:00Z')),'2026-10-22')
  assert.equal(editToday(new Date('2026-10-23T06:00:00Z')),'2026-10-23')
  const today=editToday(),past=new Date(today+'T12:00:00Z');past.setUTCDate(past.getUTCDate()-1)
  const yesterday=past.toISOString().slice(0,10),plan={period_start:yesterday,period_end:'2099-01-01'}
  assert.doesNotThrow(()=>assertEditDates(plan,today,'2098-01-01'))
  assert.throws(()=>assertEditDates(plan,yesterday,today),{code:'PLAN_EDIT_DATE_LOCKED'})
  assert.throws(()=>assertEditDates(plan,today,yesterday),{code:'PLAN_EDIT_DATE_LOCKED'})
  assert.throws(()=>assertEditDates(plan,'2099-01-02'),{code:'PLAN_EDIT_DATE_LOCKED'})
})
test('started, resolved and cancellation-pending visits remain immutable',()=>{
  assert.doesNotThrow(()=>assertUnstartedItem({status:'PENDING'}))
  for(const input of [{status:'DONE'},{status:'IN_PROGRESS'},{status:'PENDING',check_in_at:new Date()},{status:'PENDING',check_out_at:new Date()},{status:'PENDING',cancellation_request_status:'PENDING'},{status:'PENDING',removed_at:new Date()}]) assert.throws(()=>assertUnstartedItem(input),{code:'PLAN_EDIT_ITEM_LOCKED'})
})
test('migration, actual approval hierarchy, request lifecycle and concurrent decisions', {skip:!process.env.TEST_ADMIN_DATABASE_URL},async t=>{
  const url=new URL(process.env.TEST_ADMIN_DATABASE_URL)
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname),'Only disposable local databases')
  url.pathname='/postgres';const admin=new Pool({connectionString:url.toString(),max:1})
  const name='codex_plan_edit_'+randomUUID().replaceAll('-','').slice(0,12),createdRoles=[]
  let db,created=false
  const id=Object.fromEntries(['manager','coord','shared','other','sup','coordPlan','plan','extra'].map(x=>[x,randomUUID()]))
  const actor=(key,rol)=>({id:id[key],rol,area:'FARMACIAS',activo:true,channel:'WEB'})
  const sup=actor('sup','SUPERVISOR'),coord=actor('coord','COORDINADOR'),shared=actor('shared','COORDINADOR'),manager=actor('manager','GERENTE'),other=actor('other','COORDINADOR')
  const migrate=path=>readFile(new URL('../../supabase/migrations/'+path,import.meta.url),'utf8')
  try {
    for(const role of ['anon','authenticated','service_role']) if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount){await admin.query('CREATE ROLE '+role+' NOLOGIN');createdRoles.push(role)}
    await admin.query('CREATE DATABASE "'+name+'"');created=true;url.pathname='/'+name;db=new Pool({connectionString:url.toString(),max:5})
    await db.query(`CREATE TABLE personas(id uuid PRIMARY KEY,nombre text,superior_id uuid,area text,rol text,activo boolean);
      CREATE TABLE person_state_scope(persona_id uuid,estado text,revoked_at timestamptz);
      CREATE TABLE puebla_supervisor_coordinator(coordinator_id uuid,supervisor_id uuid,revoked_at timestamptz);
      CREATE TABLE work_plan(id uuid PRIMARY KEY,supervisor_id uuid,revision_number integer,status text,archived_at timestamptz,period_start date,period_end date,plan_type text);
      CREATE TABLE work_plan_event(id uuid DEFAULT gen_random_uuid(),plan_id uuid,entity_type text,entity_id uuid,revision_number integer,event_type text,actor_id uuid,actor_area text,actor_role text,previous_status text,new_status text,comment text,before_data jsonb,after_data jsonb,metadata jsonb);`)
    const puebla=await migrate('20261018120000_puebla_shared_reporting_availability.sql')
    await db.query(puebla.match(/CREATE FUNCTION public\.puebla_shared_supervisor[\s\S]*?\$\$;/)[0])
    const policy=await migrate('20261019140000_plan_approvals_notifications.sql')
    await db.query(policy.slice(0,policy.indexOf('CREATE TABLE public.app_push_device')))
    await db.query(await migrate('20261022120000_work_plan_edit_requests.sql'))
    for(const [key,role,superior] of [['manager','GERENTE',null],['coord','COORDINADOR',id.manager],['shared','COORDINADOR',id.manager],['other','COORDINADOR',null],['sup','SUPERVISOR',id.coord]])await db.query("INSERT INTO personas VALUES($1,$2,$3,'FARMACIAS',$4,true)",[id[key],key,superior,role])
    for(const key of ['sup','coord','shared'])await db.query("INSERT INTO person_state_scope VALUES($1,'PUEBLA',NULL)",[id[key]])
    await db.query('INSERT INTO puebla_supervisor_coordinator VALUES($1,$2,NULL)',[id.shared,id.sup])
    for(const [key,owner,type] of [['plan',id.sup,'ORDINARY'],['extra',id.sup,'EXTRAORDINARY'],['coordPlan',id.coord,'ORDINARY']])await db.query("INSERT INTO work_plan VALUES($1,$2,1,'APPROVED',NULL,$3::date,$3::date+6,$4)",[id[key],owner,editToday(),type])
    const change=async(planId,who,action,reason='Cambio de fecha y actividades')=>{const c=await db.connect();try{await c.query('BEGIN');const result=await changeEditRequest(c,{planId,actor:who,action,reason});await c.query('COMMIT');return result} catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
    await t.test('ordinary and extraordinary requests require owner, reason and an approved live plan',async()=>{
      await assert.rejects(change(id.plan,coord,'request'),{code:'EDIT_OWNER_REQUIRED'})
      await assert.rejects(change(id.plan,sup,'request',' '),{code:'EDIT_REASON_REQUIRED'})
      for(const key of ['plan','extra']){assert.equal((await change(id[key],sup,'request')).request.status,'PENDING');await assert.rejects(change(id[key],sup,'request'),{code:'EDIT_REQUEST_ALREADY_OPEN'});assert.equal((await getEditAccess(db,id[key],sup)).canEdit,false)}
    })
    await t.test('self approval, unrelated coordinator and inactive actor denied; both Puebla coordinators see requests',async()=>{
      await assert.rejects(change(id.plan,sup,'approve'),{code:'EDIT_REVIEW_FORBIDDEN'})
      await assert.rejects(change(id.plan,other,'approve'),{code:'WORK_PLAN_NOT_FOUND'})
      await assert.rejects(change(id.plan,{...coord,activo:false},'approve'),{code:'EDIT_ROLE_REQUIRED'})
      assert.equal((await listEditRequests(db,coord)).requests.length,2)
      assert.equal((await listEditRequests(db,shared)).requests.length,2)
      assert.equal((await listEditRequests(db,other)).requests.length,0)
    })
    await t.test('two simultaneous decisions produce exactly one winner and one audit decision',async()=>{
      const results=await Promise.allSettled([change(id.plan,coord,'approve'),change(id.plan,shared,'approve')])
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'EDIT_REQUEST_NOT_PENDING')
      assert.equal((await getEditAccess(db,id.plan,sup)).canEdit,true)
      assert.equal((await db.query("SELECT count(*)::int n FROM work_plan_event WHERE plan_id=$1 AND event_type='EDIT_APPROVE'",[id.plan])).rows[0].n,1)
      assert.equal((await db.query('SELECT status FROM work_plan WHERE id=$1',[id.plan])).rows[0].status,'APPROVED')
    })
    await t.test('closing revokes write access, audit is preserved and another request can be rejected',async()=>{
      await change(id.plan,sup,'finish');assert.equal((await getEditAccess(db,id.plan,sup)).canEdit,false)
      assert.equal((await attachEditAuthorization(db,(await db.query('SELECT * FROM work_plan WHERE id=$1',[id.plan])).rows[0])).editAuthorization,null)
      await change(id.plan,sup,'request');await change(id.plan,manager,'reject')
      assert.equal((await getEditAccess(db,id.plan,sup)).request.status,'REJECTED')
      assert.equal((await db.query('SELECT count(*)::int n FROM work_plan_edit_request WHERE plan_id=$1',[id.plan])).rows[0].n,2)
    })
    await t.test('coordinator plans require their manager; stale revisions and expired plans never grant editing',async()=>{
      await change(id.coordPlan,coord,'request')
      await assert.rejects(change(id.coordPlan,shared,'approve'),{code:'WORK_PLAN_NOT_FOUND'})
      await change(id.coordPlan,manager,'approve');assert.equal((await getEditAccess(db,id.coordPlan,coord)).canEdit,true)
      await db.query('UPDATE work_plan SET revision_number=2 WHERE id=$1',[id.coordPlan]);assert.equal((await getEditAccess(db,id.coordPlan,coord)).canEdit,false)
      assert.equal((await attachEditAuthorization(db,(await db.query('SELECT * FROM work_plan WHERE id=$1',[id.coordPlan])).rows[0])).editAuthorization,null)
      await db.query("UPDATE work_plan SET period_end=$2::date-1 WHERE id=$1",[id.extra,editToday()])
      await assert.rejects(change(id.extra,coord,'approve'),{code:'EDIT_REQUEST_NOT_PENDING'})
      assert.equal((await getEditAccess(db,id.extra,sup)).canEdit,false)
    })
    await t.test('new table is protected by RLS and direct authenticated access is denied',async()=>{
      const r=await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='work_plan_edit_request'::regclass")
      assert.equal(r.rows[0].relrowsecurity,true)
      assert.equal((await db.query("SELECT has_table_privilege('authenticated','work_plan_edit_request','UPDATE') AS allowed")).rows[0].allowed,false)
    })
  } finally {
    if(db)await db.end()
    if(created)await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)')
    for(const role of createdRoles.reverse())await admin.query('DROP ROLE '+role)
    await admin.end()
  }
})
