const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm')
const admin = {id:'11111111-1111-4111-8111-111111111111',activo:true,area:'FARMACIAS',rol:'GERENTE',system_role:'ADMIN'}
const response = () => ({statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}})
async function route(file, profile=admin) {
 const policy=await import('../services/adminReadAccess.service.js'),routes=[],middleware=[],queries=[]
 const source=fs.readFileSync(require.resolve('../routes/'+file),'utf8').replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export default router\s*$/,'')
 const pool={async query(sql,params){queries.push({sql,params});return /WHERE auth_user_id|WHERE persona.auth_user_id/.test(sql)?{rowCount:1,rows:[profile]}:{rowCount:0,rows:[]}}}
 const ctx={...policy,pool,console,requireAuth(){},requireRoles:()=>()=>{},listEditRequests:async()=>({requests:[]}),Router:()=>({use(fn){middleware.push(fn)},get(p,...handlers){routes.push({p,h:handlers.at(-1)})},post(){},put(){},patch(){},delete(){}})}
 vm.runInNewContext(source,ctx);return{ctx,routes,middleware,queries,pool}
}
test('only an active server-loaded ADMIN opts into global read scope',async()=>{
 const {isActiveAdmin,farmaciasReadRole}=await import('../services/adminReadAccess.service.js')
 for(const p of [null,{}, {...admin,activo:false},{...admin,system_role:null},{...admin,system_role:'USER'}])assert.equal(isActiveAdmin(p),false)
 assert.equal(farmaciasReadRole(admin),'ADMIN');assert.equal(farmaciasReadRole({...admin,system_role:'USER'}),'GERENTE')
})
test('plan/assignment/coverage/inbox profile guards accept active admin reads, deny inactive profiles and preserve ordinary area gates',async()=>{
 for(const file of ['web.workPlans.route.js','web.assignments.route.js','web.coverages.route.js','web.approvals.route.js']){
  for(const [profile,allowed] of [[admin,true],[{...admin,activo:false},false],[{...admin,area:'OPERACIONES',rol:'SUPERVISOR'},true],[{...admin,area:'OPERACIONES',system_role:'USER'},false]]){
   const h=await route(file,profile),req={auth:{user:{id:'auth'}},method:'GET'},res=response();let passed=0
   for(const mw of h.middleware.slice(1)){let next=false;await mw(req,res,()=>{next=true});if(!next)break;passed++}
   assert.equal(passed===h.middleware.length-1,allowed,file+JSON.stringify(profile))
   assert.match(h.queries[0].sql,/system_role/)
   if(allowed){assert.equal(req.profile.rol,profile.rol);assert.equal(req.profile.area,'FARMACIAS');assert.equal(req.profile.system_role,'ADMIN')}
   else assert.equal(res.statusCode,403)
  }
 }
})
test('coverage/inbox POST cannot use the administrator read bypass',async()=>{
 for(const file of ['web.coverages.route.js','web.approvals.route.js']){
  const h=await route(file,{...admin,area:'OPERACIONES',rol:'SUPERVISOR'}),res=response();let passed=false
  await h.middleware[1]({auth:{user:{id:'auth'}},method:'POST'},res,()=>{passed=true})
  assert.equal(passed,false);assert.equal(res.statusCode,403)
 }
})
test('assignment read queries remove hierarchy restrictions only for verified admin and retain state filter',async()=>{
 for(const system_role of ['ADMIN','USER']){
  const actor={...admin,system_role},h=await route('web.assignments.route.js',actor)
  for(const fn of ['getUnits','getCoordinators','getSupervisors'])await h.ctx[fn]({profile:actor,state:'Puebla'})
  assert.equal(h.queries.length,3)
  if(system_role==='ADMIN'){
   assert.equal(h.queries[0].params.length,1);assert.match(h.queries[0].sql,/AND\s+TRUE/)
   for(const query of h.queries.slice(1))assert.match(query.sql,/\$1::uuid IS NOT NULL/)
  }else {assert.equal(h.queries[0].params.length,2);assert.match(h.queries[1].sql,/coordinator.superior_id/)}
  for(const query of h.queries)assert.ok(query.params.includes('Puebla'))
 }
 const h=await route('web.assignments.route.js'),res=response()
 await h.routes.find(r=>r.p==='/').h({profile:admin,query:{state:'Puebla'}},res)
 assert.equal(res.statusCode,200);assert.equal(res.body.context.canManageDirectly,false);assert.equal(res.body.context.canRequestChanges,false)
 assert.equal(h.queries.at(-1).params[1],'ADMIN')
})
test('plan list permits admin without personal state scope, keeping operational owners and period filters',async()=>{
 for(const system_role of ['ADMIN','USER']){
  const actor={...admin,system_role},h=await route('web.workPlans.route.js',actor),res=response()
  await h.routes.find(r=>r.p==='/').h({profile:actor,query:{state:'Puebla',periodStart:'2026-10-19',periodEnd:'2026-10-25'}},res)
  assert.equal(res.statusCode,system_role==='ADMIN'?200:403)
  if(system_role==='ADMIN'){
   const query=h.queries.find(q=>q.sql.includes('WITH authorized_supervisors'))
   assert.equal(query.params[0],'ADMIN');assert.equal(query.params[1],'Puebla');assert.match(query.sql,/\$1::text = 'ADMIN' OR/)
  }
 }
})
test('directory uses admin role only from authoritative profile; ordinary scope and inactive checks stay enforced',async()=>{
 for(const [actor,expected] of [[admin,200],[{...admin,system_role:'USER'},403],[{...admin,activo:false},403]]){
  const h=await route('personas.route.js',actor),res=response()
  await h.routes.find(r=>r.p==='/directory').h({auth:{user:{id:'auth'}},query:{state:'Puebla',system_role:'ADMIN'}},res)
  assert.equal(res.statusCode,expected)
  if(expected===200){assert.equal(h.queries[1].params[1],'ADMIN');assert.match(h.queries[1].sql,/\$2::text = 'ADMIN' OR/)}
 }
})
test('approval read queries expose all pending records for admin while action roles remain unchanged',async()=>{
 const h=await route('web.approvals.route.js')
 for(const fn of ['getPendingPlans','getPendingCancellations','getPendingCoverages'])await h.ctx[fn](admin)
 for(const q of h.queries){assert.equal(q.params[0],'ADMIN');assert.match(q.sql,/\$1::text = 'ADMIN' OR/)}
 const res=response();await h.routes.find(r=>r.p==='/').h({profile:admin},res)
 assert.equal(res.statusCode,200);assert.equal(res.body.context.canDecide,false)
})
test('admin reads plan edit history without receiving approval capability; regular read and write hierarchy are preserved',async()=>{
 const {getEditAccess,listEditRequests,changeEditRequest}=await import('../services/workPlanEdit.service.js'),calls=[]
 const plan={id:'22222222-2222-4222-8222-222222222222',supervisor_id:'other',status:'APPROVED',period_start:'2026-01-01',period_end:'2099-01-01',revision_number:1,can_review:false}
 const db={async query(sql,params){calls.push({sql,params});return{rows:sql.includes('FROM public.work_plan p')?[plan]:[]}}}
 const result=await getEditAccess(db,plan.id,admin)
 assert.equal(result.canReview,false);assert.equal(result.canEdit,false);assert.equal(result.canRequest,false)
 await listEditRequests(db,admin);assert.equal(calls.at(-1).params[1],true)
 await listEditRequests(db,{...admin,system_role:'USER'});assert.equal(calls.at(-1).params[1],false)
 await assert.rejects(changeEditRequest(db,{planId:plan.id,actor:{...admin,rol:'DIRECTOR'},action:'approve'}),{code:'EDIT_ROLE_REQUIRED'})
})

test('coverage/report services use global scope for active admin reads and retain ordinary scope',async()=>{
 const policy=await import('../services/adminReadAccess.service.js'),{reportingPeople}=await import('../services/farmaciasReporting.service.js')
 const source=fs.readFileSync(require.resolve('../services/pharmacyCoverage.service.js'),'utf8').replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export /g,'')
 for(const system_role of ['ADMIN','USER']){
  const queries=[],actor={...admin,system_role},pool={async query(sql,params){queries.push({sql,params});return{rows:[]}}}
  const ctx={...policy,pool};vm.runInNewContext(source,ctx)
  const result=await ctx.listPharmacyCoverages({state:'Puebla',actor})
  assert.equal(queries[0].params[2],system_role==='ADMIN'?'ADMIN':'GERENTE');assert.match(queries[0].sql,/\$3::text = 'ADMIN' OR EXISTS/)
  if(system_role==='ADMIN'){assert.equal(result.context.canApprove,false);assert.equal(result.context.canCreateDirect,false)}
  await reportingPeople(pool,actor);assert.equal(queries.at(-1).params[1],system_role==='ADMIN')
 }
})

test('changed SELECT statements parse in a disposable local PostgreSQL database',{skip:!process.env.TEST_ADMIN_DATABASE_URL},async()=>{
 const {Pool}=require('pg'),{randomUUID}=require('node:crypto'),policy=await import('../services/adminReadAccess.service.js')
 const url=new URL(process.env.TEST_ADMIN_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname));url.pathname='/postgres'
 const control=new Pool({connectionString:url.toString(),max:1}),name='codex_admin_reads_'+randomUUID().replaceAll('-','');let db,created=false
 try{
  await control.query('CREATE DATABASE "'+name+'"');created=true;url.pathname='/'+name;db=new Pool({connectionString:url.toString(),max:1})
  const statements=[]
  for(const file of ['web.workPlans.route.js','web.assignments.route.js','personas.route.js','web.approvals.route.js']){
   const h=await route(file),req={profile:admin,auth:{user:{id:admin.id}},query:{state:'Puebla',periodStart:'2026-10-19',periodEnd:'2026-10-25'}}
   for(const mw of h.middleware.slice(1))await mw(req,response(),()=>{})
   if(file==='personas.route.js')await h.routes.find(r=>r.p==='/directory').h(req,response())
   else await h.routes.find(r=>r.p==='/').h(req,response())
   statements.push(...h.queries)
  }
  const source=fs.readFileSync(require.resolve('../services/pharmacyCoverage.service.js'),'utf8').replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export /g,'')
  const ctx={...policy,pool:{async query(sql,params){statements.push({sql,params});return{rows:[]}}}};vm.runInNewContext(source,ctx);await ctx.listPharmacyCoverages({state:'Puebla',actor:admin})
  assert.ok(statements.length>=15)
  // An empty fixture intentionally has no application tables. PostgreSQL must finish
  // parsing each entire SELECT before reporting a missing relation/function.
  for(const {sql,params} of statements){
   try{await db.query('EXPLAIN '+sql,params)}catch(error){assert.ok(['42P01','42883'].includes(error.code),error.code+': '+error.message)}
  }
 }finally{if(db)await db.end();if(created)await control.query('DROP DATABASE "'+name+'" WITH (FORCE)');await control.end()}
})

test('shared edit router carries ADMIN read scope only for web GET; mobile and write authorization stay ordinary',async()=>{
 for(const method of ['GET','POST'])for(const originalUrl of ['/api/web/work-plans/plan/edit-request','/api/mobile/work-plans/plan/edit-request']){
  const h=await route('workPlanEdit.route.js',{...admin,rol:'DIRECTOR'}),req={auth:{user:{id:'auth'}},method,originalUrl},res=response();let passed=false
  await h.middleware[2](req,res,()=>{passed=true})
  const expected=method==='GET'&&originalUrl.startsWith('/api/web/')
  assert.equal(passed,expected)
  if(expected)assert.equal(req.editActor.system_role,'ADMIN');else assert.equal(res.statusCode,403)
 }
})
