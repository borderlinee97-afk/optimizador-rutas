const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')

test('approval inbox returns ordinary and extraordinary edit requests in its total using existing scoped policy',async()=>{
 const {listEditRequests}=await import('../services/workPlanEdit.service.js')
 const {isActiveAdmin,farmaciasReadRole}=await import('../services/adminReadAccess.service.js')
 const requests=[{id:'r1',plan_id:'p1',plan_type:'ORDINARY',owner_name:'SUPERVISOR PRUEBA'},{id:'r2',plan_id:'p2',plan_type:'EXTRAORDINARY',owner_name:'SUPERVISOR PRUEBA'}]
 for(const role of ['COORDINADOR','GERENTE']){
  const routes=[],queries=[],actor={id:'actor',rol:role,area:'FARMACIAS',activo:true}
  const source=fs.readFileSync(path.join(__dirname,'../routes/web.approvals.route.js'),'utf8').replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export default router\s*$/,'')
  const pool={query:async(sql,params)=>{queries.push({sql,params});return{rows:requests}}}
  const ctx={Router:()=>({use(){},get:(p,h)=>routes.push([p,h]),post(){}}),pool,requireAuth(){},listEditRequests,isActiveAdmin,farmaciasReadRole,console}
  vm.runInNewContext(source,ctx)
  for(const name of ['getPendingPlans','getPendingCancellations','getPendingCoverages'])ctx[name]=async()=>({rows:[]})
  let body;await routes.find(([p])=>p==='/')[1]({profile:actor},{json:v=>{body=v},status(){return this}})
  assert.equal(body.counts.editRequests,2);assert.equal(body.counts.total,2);assert.equal(body.pendingCount,2)
  assert.equal(body.editRequests[1].plan_type,'EXTRAORDINARY');assert.equal(body.context.canDecide,true)
  assert.deepEqual(queries[0].params,['actor',false])
  assert.match(queries[0].sql,/can_review_farmacias_plan/);assert.match(queries[0].sql,/r.status='PENDING'/)
  assert.match(queries[0].sql,/revision_number=p.revision_number/);assert.match(queries[0].sql,/period_end >=/)
 }
})

test('real approvals page displays edits metric and supplies the inbox; refresh and decision reload counts',async()=>{
 const vue=require('../../node_modules/vue'),{parse,compileScript}=require('../../node_modules/@vue/compiler-sfc')
 const descriptor=parse(fs.readFileSync(path.join(__dirname,'../../src/views/farmacias/ApprovalsView.vue'),'utf8')).descriptor
 let code=compileScript(descriptor,{id:'approval-inbox-test',inlineTemplate:true}).content
 const mounted=[],editComponent={name:'EditInbox'},requests=[{id:'r',plan_id:'p',plan_type:'EXTRAORDINARY',owner_name:'SUPERVISOR'}]
 let current=requests,calls=0
 const ctx={module:{exports:{}},console,__vue:{...vue,onMounted:fn=>mounted.push(fn)},__editComponent:editComponent,__router:{push(){}},__api:{getWebApprovals:async()=>{calls++;return{context:{canDecide:true},counts:{editRequests:current.length,total:current.length},editRequests:current,plans:[],cancellationRequests:[],coverageRequests:[]}}}}
 code=code.replace(/import\s+WorkPlanEditAccess\s+from\s+['"][^'"]+['"]/g,'const WorkPlanEditAccess=__editComponent')
 code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]vue['"]/g,(_,names)=>`const {${names.replace(/\bas\b/g,':')}}=__vue`)
 code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]vue-router['"]/g,'const useRouter=()=>__router')
 code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*services\/api.js['"]/g,(_,names)=>`const {${names}}=__api`)
 code=code.replace('export default','module.exports =');vm.runInNewContext(code,ctx)
 const render=ctx.module.exports.setup({}, {expose(){}});for(const fn of mounted)await fn()
 const nodes=(n,out=[])=>{if(Array.isArray(n)){n.forEach(x=>nodes(x,out));return out}if(n&&typeof n==='object'){out.push(n);if(Array.isArray(n.children))nodes(n.children,out)}return out}
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.children):String(n??'')
 let all=nodes(render({},[])),inbox=all.find(n=>n.type===editComponent)
 assert.equal(inbox.props['inbox-requests'].length,1);assert.ok(Object.hasOwn(inbox.props,'show-empty'))
 const metric=all.find(n=>n.type==='article'&&text(n).includes('Ediciones de plan'));assert.ok(metric);assert.match(text(metric),/1/)
 await inbox.props.onRefresh();assert.equal(calls,2)
 current=[];await inbox.props.onUpdated();all=nodes(render({},[]));inbox=all.find(n=>n.type===editComponent)
 assert.equal(inbox.props['inbox-requests'].length,0);assert.equal(calls,3)
})

test('administrative close stays visible as not completed and never earns coverage, completed visits or duration',async()=>{
 const {buildReport,validateReportFilters,reportCsv,executionDetails}=await import('../services/farmaciasReporting.service.js')
 const {reportVisitStatus,isAdministrativelyUnfinished}=await import('../../src/utils/farmaciasReports.js')
 const unit={pharmacy_id:'1',unit_name:'FARMACIA PRUEBA',project:'PUEBLA',warehouse:false}
 const input={...unit,id:'visit',plan_id:'plan',person_id:'owner',person_name:'SUPERVISOR PRUEBA',name:unit.unit_name,
  status:'SKIPPED',source:'PLAN',scheduled_date:'2026-10-21',check_in_at:'2026-10-21T15:50:44Z',check_out_at:null,dwell_seconds:null,
  skip_reason:'CIERRE_ADMINISTRATIVO_NO_FINALIZADA: cierre solicitado',activities:[{id:'a1',status:'DONE'},{id:'a2',status:'PENDING'}]}
 const data={people:[{id:'owner',name:'SUPERVISOR PRUEBA',role:'SUPERVISOR',coordinatorIds:[],coordinatorNames:[]}],assignments:[{...unit,person_id:'owner',assigned_at:'2026-10-01T06:00Z',revoked_at:null}],coverages:[],vacations:[],visits:[input]}
 const report=buildReport(data,validateReportFilters({startDate:'2026-10-01',endDate:'2026-10-31'}))
 assert.equal(report.summary.notCompleted,1);assert.equal(report.summary.inProgress,0);assert.equal(report.summary.completedVisits,0)
 assert.equal(report.summary.effectiveSeconds,0);assert.equal(report.summary.servicedAssigned,0)
 const visit=report.visits[0];assert.equal(visit.notCompleted,true);assert.equal(visit.completed,false);assert.equal(visit.checkOutAt,null);assert.equal(visit.dwellSeconds,null)
 assert.equal(reportVisitStatus(visit),'No finalizada');assert.match(reportCsv(report,'visits'),/NO_FINALIZADA/)
 assert.equal(input.activities[1].status,'PENDING')
 assert.equal(isAdministrativelyUnfinished({status:'SKIPPED',checkInAt:input.check_in_at,skipReason:input.skip_reason}),true)
 assert.equal(executionDetails({...input,skip_reason:'Unidad cerrada'}).notCompleted,false)
 assert.equal(reportVisitStatus({...visit,notCompleted:false,skipReason:'Unidad cerrada'}),'Omitida')
})


test('real detail status cell renders administrative closure as No finalizada and normal omissions keep their label',async()=>{
 const vue=require('../../node_modules/vue'),{compile}=require('../../node_modules/@vue/compiler-dom'),{renderToString}=require('../../node_modules/@vue/server-renderer')
 const {isAdministrativelyUnfinished}=await import('../../src/utils/farmaciasReports.js')
 const source=fs.readFileSync(path.join(__dirname,'../../src/views/farmacias/WorkPlanDetailView.vue'),'utf8')
 const fn=source.slice(source.indexOf('function itemStatusLabel('),source.indexOf('function statusClass('))
 const ctx={isAdministrativelyUnfinished};vm.runInNewContext(fn,ctx)
 const expression=source.match(/\{\{\s*itemStatusLabel\([\s\S]*?\)\s*\}\}/)[0]
 const render=new Function('Vue',compile(`<span>${expression}</span>`,{mode:'function'}).code)(vue)
 const closed={status:'SKIPPED',checkInAt:'2026-10-21T15:50:44Z',checkOutAt:null,skipReason:'CIERRE_ADMINISTRATIVO_NO_FINALIZADA: cierre solicitado'}
 assert.match(await renderToString(render({item:closed,itemStatusLabel:ctx.itemStatusLabel},[])),/No finalizada/)
 assert.match(await renderToString(render({item:{...closed,skipReason:'Unidad cerrada'},itemStatusLabel:ctx.itemStatusLabel},[])),/No realizada/)
})
