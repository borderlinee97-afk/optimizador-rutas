const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {parse,compileScript}=require('../../node_modules/@vue/compiler-sfc'),vue=require('../../node_modules/vue')
const ID='11111111-1111-4111-8111-111111111111'
const release={buildId:ID,version:'1.0.0',versionCode:3,byteSize:12345,sha256:'a'.repeat(64),notes:'Mejoras de prueba'}
function harness(role='ADMIN'){
 const {descriptor}=parse(fs.readFileSync(require.resolve('../../src/views/admin/AndroidUpdatesView.vue'),'utf8'))
 let source=compileScript(descriptor,{id:'panel-test'}).content.replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace('export default','module.exports =')
 const auth={systemRole:vue.ref(role),profile:vue.ref({id:'owner'})},calls=[],watchers=[]
 let state={revision:0,highestVersionCode:0,current:null,expoConfigured:true,releases:[],events:[]},gate=null
 const ctx={module:{exports:{}},ref:vue.ref,watch(_refs,fn,options){watchers.push(fn);if(options?.immediate)fn()},useAuth:()=>auth,Intl,Date,
  androidUpdatesApi:async(path='',body)=>{calls.push({path,body});if(gate)await gate;if(path==='/prepare')return{release};if(path==='/publish'){state={...state,current:release,revision:1,highestVersionCode:3};return{published:true}}if(path==='/withdraw'){state={...state,current:null,revision:2};return{withdrawn:true}}return JSON.parse(JSON.stringify(state))}}
 vm.runInNewContext(source,ctx)
 const panel=ctx.module.exports.setup({}, {expose(){}})
 return{panel,calls,template:descriptor.template.content,flush:()=>new Promise(r=>setImmediate(r)),hold(value){gate=value},switchRole(value){auth.systemRole.value=value;watchers[0]()}}
}
test('admin verifies first and publication is a separate explicit tested approval',async()=>{
 const h=harness();await h.flush();h.calls.length=0
 h.panel.buildUrl.value=ID;h.panel.notes.value='Mejoras de prueba';await h.panel.prepare()
 assert.deepEqual(h.calls.map(c=>c.path),['/prepare','']);assert.equal(h.panel.candidate.value.buildId,ID);assert.equal(h.panel.confirmed.value,false)
 await h.panel.publish();assert.equal(h.calls.filter(c=>c.path==='/publish').length,0)
 h.panel.confirmed.value=true;await h.panel.publish();const sent=h.calls.find(c=>c.path==='/publish').body
 assert.equal(sent.confirmTested,true);assert.equal(sent.expectedRevision,0);assert.equal(sent.buildId,ID)
 assert.equal(h.panel.state.value.current.buildId,ID);assert.equal(h.panel.candidate.value,null)
 h.panel.withdrawReason.value='Retiro de prueba';await h.panel.withdraw();assert.equal(h.panel.state.value.current,null)
 assert.match(h.template,/No necesitan abrir el enlace de Expo/)
 assert.doesNotMatch(h.template,/type="password"/)
})
test('changing release inputs clears prior consent; a non-admin never loads panel data',async()=>{
 const h=harness();await h.flush();h.panel.candidate.value=release;h.panel.confirmed.value=true;h.panel.clearSelection()
 assert.equal(h.panel.candidate.value,null);assert.equal(h.panel.confirmed.value,false)
 const denied=harness('GERENTE');await denied.flush();assert.equal(denied.calls.length,0);assert.equal(denied.panel.state.value,null)
})
test('logout or role change discards a late server response and previously loaded administrator data',async()=>{
 const h=harness();await h.flush();let releaseGate;h.hold(new Promise(r=>releaseGate=r))
 const request=h.panel.load();h.switchRole('SUPERVISOR');releaseGate();await request
 assert.equal(h.panel.state.value,null);assert.equal(h.panel.candidate.value,null);assert.equal(h.panel.busy.value,false)
})
test('actual navigation guard permits admin route exclusively to ADMIN and leaves normal routes unchanged',()=>{
 const source=fs.readFileSync(require.resolve('../../src/App.vue'),'utf8'),start=source.indexOf('function routeAllowedForProfile('),end=source.indexOf('function getDefaultPath()',start)
 for(const role of ['ADMIN','GERENTE','']){
  const ctx={systemRole:{value:role},normalizedArea:{value:'FARMACIAS'},normalizedRole:{value:'GERENTE'}};vm.runInNewContext(source.slice(start,end),ctx)
  assert.equal(ctx.routeAllowedForProfile({path:'/admin/actualizaciones',meta:{adminOnly:true}}),role==='ADMIN')
  assert.equal(ctx.routeAllowedForProfile({path:'/farmacias/planes',meta:{roles:['GERENTE']}}),true)
 }
 assert.match(source,/item\.adminOnly \? systemRole\.value==='ADMIN'/)
 const menu=source.slice(source.indexOf('const managementMenu'),source.indexOf('const activeMenuItem'))
 for(const key of ['app-updates','approvals','assignments','people','indicators','reports'])assert.ok(menu.includes("'"+key+"'"))
})
