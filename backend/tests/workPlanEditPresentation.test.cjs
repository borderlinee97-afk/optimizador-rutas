const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const vue=require('vue'),{parse,compileScript}=require('@vue/compiler-sfc'),{renderToString}=require('@vue/server-renderer')
const {descriptor}=parse(fs.readFileSync(require.resolve('../../src/components/WorkPlanEditAccess.vue'),'utf8'))
const compiled=compileScript(descriptor,{id:'edit-test',inlineTemplate:true}).content
async function harness(state,{inbox=false,fail=false,controlled=null}={}){
  const callbacks=[],calls=[],events=[],routes=[];let inboxReads=0
  const ctx={module:{exports:{}},window:{confirm:()=>true},__vue:{...vue,onMounted:fn=>callbacks.push(fn),watch(){}},__router:{push:x=>routes.push(x)},__api:{
    getPlanEditAccess:async()=>{if(fail)throw Error('Sin conexión');return state},listPlanEditRequests:async()=>{inboxReads++;return({requests:[{id:'r',plan_id:'p',owner_name:'SUPERVISOR PRUEBA',plan_type:'ORDINARY',period_start:'2026-10-19',period_end:'2026-10-25',reason:'Cambio de visitas'}]})},
    changePlanEditRequest:async(id,action,reason)=>{calls.push({id,action,reason});state={...state,canRequest:false,canReview:false,canEdit:action==='approve',canFinish:action==='approve',request:{status:{request:'PENDING',approve:'APPROVED',reject:'REJECTED',finish:'COMPLETED'}[action],reason:reason||'Cambio'}}}
  }}
  let code=compiled.replace(/import\s*\{([^}]+)\}\s*from\s*['"]vue['"]/g,(_,names)=>`const {${names.replace(/\bas\b/g,':')}}=__vue`)
  code=code.replace(/import\s*\{useRouter\}\s*from\s*'vue-router'/,"const useRouter=()=>__router")
  code=code.replace(/import\s*\{([^}]+)\}\s*from\s*'\.\.\/services\/api.js'/,(_,names)=>`const {${names}}=__api`)
  code=code.replace('export default','module.exports =')
  vm.runInNewContext(code,ctx)
  const render=ctx.module.exports.setup({planId:inbox?'':'p',editing:false,inboxRequests:controlled,showEmpty:controlled!==null},{emit:(...args)=>events.push(args)})
  for(const fn of callbacks)await fn()
  const nodes=(node,result=[])=>{if(node&&typeof node==='object'){result.push(node);if(Array.isArray(node.children))node.children.forEach(x=>nodes(x,result))}return result}
  return {calls,events,routes,get inboxReads(){return inboxReads},html:()=>renderToString(render({},[])),find:(type,text)=>nodes(render({},[])).find(n=>n.type===type&&(!text||JSON.stringify(n.children).includes(text)))}
}
test('owner opens a labelled request, sends the reason and sees pending authorization',async()=>{
  const h=await harness({canRequest:true,today:'2026-10-22',minDate:'2026-10-22',request:null})
  assert.match(await h.html(),/Solicitar edición/)
  h.find('button','Solicitar edición').props.onClick()
  const text=h.find('textarea');assert.ok(text.props.id);text.props['onUpdate:modelValue']('Ajustar las visitas del viernes')
  await h.find('form').props.onSubmit({preventDefault(){}})
  assert.equal(h.calls[0].reason,'Ajustar las visitas del viernes');assert.equal(h.calls[0].action,'request')
  assert.match(await h.html(),/Autorización pendiente/)
  assert.doesNotMatch(await h.html(),/Editar visitas autorizadas/)
})
test('authorized owner has edit and finish actions and cannot edit after finishing',async()=>{
  const h=await harness({canEdit:true,canFinish:true,minDate:'2026-10-22',request:{status:'APPROVED',reason:'Ajuste'}})
  h.find('button','Editar visitas autorizadas').props.onClick();assert.equal(h.routes[0].params.planId,'p')
  await h.find('button','Finalizar edición').props.onClick()
  assert.equal(h.calls[0].action,'finish');assert.match(await h.html(),/Edición finalizada/);assert.doesNotMatch(await h.html(),/Editar visitas autorizadas/)
})
test('reviewer sees scoped pending requests and resolves one through the shared flow',async()=>{
  const h=await harness({canReview:true,request:{status:'PENDING',reason:'Cambio'}})
  await h.find('button','Autorizar edición').props.onClick();assert.equal(h.calls[0].action,'approve')
  const inbox=await harness({}, {inbox:true});assert.match(await inbox.html(),/SUPERVISOR PRUEBA/);assert.match(await inbox.html(),/Ver plan/)
})
test('failure to load authorization never reveals editing actions',async()=>{
  const h=await harness({canEdit:true},{fail:true});assert.match(await h.html(),/Sin conexión/);assert.doesNotMatch(await h.html(),/Editar visitas autorizadas/)
})


test('controlled approvals inbox uses the aggregated requests, refreshes the parent and exposes an empty state',async()=>{
 const requests=[{id:'r',plan_id:'p',owner_name:'RESPONSABLE PRUEBA',plan_type:'EXTRAORDINARY',period_start:'2026-10-19',period_end:'2026-10-25',reason:'Cambio autorizado'}]
 const h=await harness({}, {inbox:true,controlled:requests});assert.equal(h.inboxReads,0)
 assert.match(await h.html(),/RESPONSABLE PRUEBA/);assert.match(await h.html(),/Plan extraordinario/)
 h.find('button','Actualizar').props.onClick();assert.ok(h.events.some(e=>e[0]==='refresh'));assert.equal(h.inboxReads,0)
 await h.find('button','Autorizar edición').props.onClick();assert.equal(h.calls[0].action,'approve');assert.ok(h.events.some(e=>e[0]==='updated'))
 const empty=await harness({}, {inbox:true,controlled:[]});assert.match(await empty.html(),/Sin solicitudes de edición pendientes/)
})
