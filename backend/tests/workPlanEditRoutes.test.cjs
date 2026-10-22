const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const raw=fs.readFileSync(require.resolve('../routes/mobile.workPlanItems.route.js'),'utf8').replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace(/export default router\s*$/,'')
const planId='11111111-1111-4111-8111-111111111111',itemId='22222222-2222-4222-8222-222222222222'
async function harness(path,method,{original,scheduled,status='APPROVED',grant=true,itemStatus='PENDING',checkIn=null}){
  const policy=await import('../services/workPlanEdit.service.js'),routes=[],writes=[]
  const plan={id:planId,supervisor_id:'owner',revision_number:1,status,period_start:'2020-01-01',period_end:'2099-01-01',editAuthorization:grant?{}:null}
  const item={id:itemId,scheduled_date:original,pharmacy_id:'7',status:itemStatus,check_in_at:checkIn,item_type:'PHARMACY',source:'PLAN',ord:1}
  const client={async query(sql){if(/UPDATE|INSERT|DELETE/.test(sql))writes.push(sql);if(sql.includes('FROM public.work_plan_item'))return{rows:[item]};return{rows:[]}},release(){}}
  const context={Router:()=>({use(){},post(p,h){routes.push({p,method:'POST',h})},patch(p,h){routes.push({p,method:'PATCH',h})}}),requireAuth(){},pool:{connect:async()=>client},assertEditDates:policy.assertEditDates,assertUnstartedItem:policy.assertUnstartedItem,
    parsePlannedActivitiesInput:()=>({ok:true,value:[]}),console:{error(){}}}
  vm.runInNewContext(raw,context)
  context.lockOwnedPlan=async()=>plan;context.lockPlanItem=async()=>item
  const res={statusCode:200,status(v){this.statusCode=v;return this},json(v){this.body=v;return this}}
  const req={params:{planId,itemId},profile:{id:'owner',rol:'SUPERVISOR'},body:{pharmacyId:'7',scheduledDate:scheduled,itemIds:[itemId],activities:[],reason:'Cambio'}}
  await routes.find(r=>r.p===path&&r.method===method).h(req,res)
  return{res,writes}
}
test('all planning write endpoints reject past dates before any write',async()=>{
  const {editToday}=await import('../services/workPlanEdit.service.js'),today=editToday(),date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-1);const past=date.toISOString().slice(0,10)
  for(const [path,method,original,scheduled] of [
    ['/:planId/items','POST',today,past],['/:planId/items/:itemId','PATCH',past,today],['/:planId/items/:itemId','PATCH',today,past],
    ['/:planId/items/:itemId/remove','POST',past,today],['/:planId/items/reorder','POST',today,past]]){
    const h=await harness(path,method,{original,scheduled});assert.equal(h.res.statusCode,409,path);assert.equal(h.res.body.code,'PLAN_EDIT_DATE_LOCKED',path);assert.equal(h.writes.length,0)
  }
})
test('approved plans without permission cannot be edited; execution remains protected',async()=>{
  const {editToday}=await import('../services/workPlanEdit.service.js'),today=editToday()
  const noGrant=await harness('/:planId/items','POST',{original:today,scheduled:today,grant:false});assert.equal(noGrant.res.body.code,'WORK_PLAN_NOT_EDITABLE');assert.equal(noGrant.writes.length,0)
  for(const path of ['/:planId/items/:itemId','/:planId/items/:itemId/remove']){
    const h=await harness(path,path.endsWith('remove')?'POST':'PATCH',{original:today,scheduled:today,itemStatus:'PENDING',checkIn:new Date()});assert.equal(h.res.statusCode,409);assert.equal(h.writes.length,0)
  }
})
