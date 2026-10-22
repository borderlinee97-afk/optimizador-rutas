const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {parse,compileScript}=require('@vue/compiler-sfc'),vue=require('vue')
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const day=n=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function setup(file,{type='EXTRAORDINARY',grant=true}={}){
  const {descriptor}=parse(fs.readFileSync(require.resolve('../../src/views/farmacias/'+file),'utf8'))
  let source=compileScript(descriptor,{id:'regression'}).content
  source=source.replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace('export default','module.exports =')
  const calls={updates:[],adds:[],routes:[]}
  const plan={id:'plan',status:'APPROVED',planType:type,periodStart:day(-2),periodEnd:day(3),revisionNumber:1}
  const item={id:'item',itemType:'PHARMACY',source:'PLAN',status:'PENDING',scheduledDate:today(),pharmacyId:'7',name:'Unidad prueba',activities:[{activityType:'Inventario',note:''}]}
  const response={plan,items:[item]},auth={profile:vue.ref({area:'FARMACIAS',rol:'SUPERVISOR'})}
  const ctx={module:{exports:{}},computed:vue.computed,ref:vue.ref,onMounted(){},watch(){},Intl,Date,WorkPlanEditAccess:{},AvailabilityPanel:{},
    useRoute:()=>({params:{planId:'plan'}}),useRouter:()=>({push:r=>calls.routes.push(r),replace:r=>calls.routes.push(r)}),useAuth:()=>auth,
    getPlanEditAccess:async()=>({canEdit:grant,minDate:today()}),getSupervisorWorkPlan:async()=>response,
    getSupervisorWorkPlanPharmacyFilters:async()=>({}),getSupervisorWorkPlanPharmacies:async()=>({pharmacies:[]}),
    updateSupervisorWorkPlanItem:async(...args)=>calls.updates.push(args),addSupervisorWorkPlanItem:async(...args)=>calls.adds.push(args),
    archiveSupervisorWorkPlan(){},removeSupervisorWorkPlanItem(){},reorderSupervisorWorkPlanItems(){},submitSupervisorWorkPlan(){},updateSupervisorWorkPlan(){},
    createSupervisorWorkPlan(){},getSupervisorWorkPlans:async()=>({plans:[plan]})}
  vm.runInNewContext(source,ctx)
  return {state:ctx.module.exports.setup({}, {expose(){}}),calls,plan,item,template:descriptor.template.content}
}
for(const type of ['ORDINARY','EXTRAORDINARY']){
  test(`${type}: authorization opens the actual web visit form and saves today's and future changes`,async()=>{
    const h=setup('SupervisorWorkPlanEditorView.vue',{type});await h.state.loadDetail()
    assert.equal(h.state.canMutate.value,true)
    h.state.openVisit(h.item);assert.equal(h.state.visitOpen.value,true,'authorized approved form opens')
    h.state.visitForm.value.scheduledTime='12:30';await h.state.saveVisit();assert.equal(h.calls.updates.length,1)
    h.state.openVisit(h.item);h.state.visitForm.value.scheduledDate=day(1);await h.state.saveVisit();assert.equal(h.calls.updates.length,2)
    assert.equal(h.calls.updates[1][2].scheduledDate,day(1))
    h.state.openVisit(null,day(1));h.state.visitForm.value.pharmacyId='7';h.state.visitForm.value.activities=[{activityType:'Visita adicional',note:''}];await h.state.saveVisit();assert.equal(h.calls.adds.length,1)
  })
  test(`${type}: past dates and unapproved edit requests cannot open or save retroactive edits`,async()=>{
    const h=setup('SupervisorWorkPlanEditorView.vue',{type});await h.state.loadDetail()
    h.state.openVisit({...h.item,scheduledDate:day(-1)});assert.equal(h.state.visitOpen.value,false)
    h.state.openVisit(null,day(-1));assert.equal(h.state.visitOpen.value,false)
    h.state.openVisit(h.item);h.state.visitForm.value.scheduledDate=day(-1);await h.state.saveVisit();assert.equal(h.calls.updates.length,0)
    const denied=setup('SupervisorWorkPlanEditorView.vue',{type,grant:false});await denied.state.loadDetail();denied.state.openVisit(denied.item);assert.equal(denied.state.visitOpen.value,false)
  })
}
test('Mis planes exposes requesting for current/future approved ordinary and extraordinary plans, never expired plans',()=>{
  const h=setup('SupervisorWorkPlansView.vue')
  for(const type of ['ORDINARY','EXTRAORDINARY'])for(const end of [today(),day(1)])assert.equal(h.state.canRequestEdit({...h.plan,planType:type,periodEnd:end}),true)
  assert.equal(h.state.canRequestEdit({...h.plan,periodEnd:day(-1)}),false)
  assert.equal(h.state.canRequestEdit({...h.plan,archivedAt:new Date().toISOString()}),false)
  assert.equal(h.state.canRequestEdit({...h.plan,status:'PENDING_APPROVAL'}),false)
  assert.match(h.template,/v-if="canRequestEdit\(plan\)"/)
  assert.match(h.template,/Solicitar edición/)
  assert.match(h.template,/<WorkPlanEditAccess[^>]+initially-open/)
})
