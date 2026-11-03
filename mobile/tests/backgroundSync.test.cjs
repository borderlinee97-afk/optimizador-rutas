const test=require('node:test')
const assert=require('node:assert/strict')
const {loadTs}=require('./helpers/loadTs.cjs')
class ApiError extends Error {constructor(message,status,code){super(message);this.status=status;this.code=code}}
const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222'
function harness(){
 const state={locked:false,user:A,active:null,online:true,appState:'background',profileError:null,planError:null,wait:null,afterProfile:null}
 const calls=[];const database={};const other={};let token='old'
 const profile={id:'persona-a',activo:true,area:'FARMACIAS',rol:'SUPERVISOR'}
 const storage={get db(){return state.active===B?other:database},getDatabaseUserId:()=>state.active,isDatabaseActive:id=>state.active===id,isLegacyRecoveryActive:()=>false,activateUserDatabase:id=>{calls.push('activate');state.active=id}}
 const session=()=>state.user?{user:{id:state.user},access_token:token}:null
 const service=loadTs('src/services/backgroundSync.ts',{
  '@react-native-community/netinfo':{default:{fetch:async()=>({isConnected:state.online,isInternetReachable:state.online})}},
  'react-native':{Platform:{OS:'android'},AppState:{get currentState(){return state.appState}}},
  '../../storage/db':storage,'../lib/api':{ApiError,getCurrentProfile:async access=>{calls.push('profile:'+access);if(state.profileError){const e=state.profileError;state.profileError=null;throw e}state.afterProfile?.();return {user:{id:A},profile}}},
  '../lib/supabase':{readPersistedAuthSession:async()=>session(),supabase:{auth:{getSession:async()=>({data:{session:session()},error:null}),refreshSession:async()=>{calls.push('renew-token');token='fresh';return {data:{session:session()},error:null}}}}},
  './offlineLogin':{isLocalLoginLocked:async()=>state.locked},'./profileCache':{readProfileSnapshot:async()=>({profile})},
  './taskSync':{flushTaskOutbox:async()=>{calls.push('tasks')}},
  './executionSync':{syncVisitExecution:async()=>{calls.push('execution')}},
  './evidenceSync':{syncPendingEvidence:async()=>{calls.push('photos');if(state.wait)await state.wait}},
  './planSync':{syncTodayPlan:async()=>{calls.push('week');if(state.planError)throw state.planError;return {plans:[{id:A}],items:[]}}},
  './workPlanCache':{downloadWorkPlanScreens:async()=>{calls.push('details')}},
 })
 return {state,calls,profile,service}
}
test('background sync validates profile and drains tasks, execution, photos, execution, week and details in order',async()=>{
 const h=harness();assert.equal(await h.service.runBackgroundSync(),'synced')
 assert.deepEqual(h.calls,['profile:old','activate','tasks','execution','photos','execution','week','details'])
})
test('explicit logout, missing session, foreground and another active account never start a background download',async()=>{
 for(const change of [s=>s.locked=true,s=>s.user=null,s=>s.appState='active',s=>s.active=B]){
  const h=harness();change(h.state);assert.equal(await h.service.runBackgroundSync(),'skipped');assert.ok(!h.calls.includes('week'));assert.ok(!h.calls.includes('activate'))
 }
})
test('offline retries later; authorization denial never uses cached permissions to upload or download',async()=>{
 const offline=harness();offline.state.online=false;assert.equal(await offline.service.runBackgroundSync(),'retry');assert.deepEqual(offline.calls,[])
 const denied=harness();denied.state.profileError=new ApiError('Denied',403);assert.equal(await denied.service.runBackgroundSync(),'retry');assert.deepEqual(denied.calls,['profile:old'])
 const inactive=harness();inactive.profile.activo=false;assert.equal(await inactive.service.runBackgroundSync(),'skipped');assert.deepEqual(inactive.calls,['profile:old'])
})
test('expired token is renewed once and checked online; an account change during profile validation cannot activate A',async()=>{
 const h=harness();h.state.profileError=new ApiError('Expired',401);assert.equal(await h.service.runBackgroundSync(),'synced');assert.deepEqual(h.calls.slice(0,3),['profile:old','renew-token','profile:fresh'])
 const switched=harness();switched.state.afterProfile=()=>{switched.state.user=B;switched.state.active=B}
 assert.equal(await switched.service.runBackgroundSync(),'skipped');assert.ok(!switched.calls.includes('activate'))
})
test('logout while evidence uploads stops subsequent work; concurrent workers share one batch',async()=>{
 const h=harness();let done;h.state.wait=new Promise(resolve=>{done=resolve})
 const first=h.service.runBackgroundSync(),second=h.service.runBackgroundSync();assert.equal(first,second)
 await new Promise(resolve=>setImmediate(resolve));assert.ok(h.calls.includes('photos'))
 h.state.locked=true;h.state.active=null;done()
 assert.equal(await first,'skipped');assert.ok(!h.calls.includes('week'));assert.equal(h.calls.filter(c=>c==='photos').length,1)
})
test('pending local conflicts preserve prior cache and do not claim a successful weekly download',async()=>{
 const h=harness();h.state.planError=new ApiError('Pending local data',409,'LOCAL_PENDING_OPERATIONS')
 assert.equal(await h.service.runBackgroundSync(),'retry');assert.ok(!h.calls.includes('details'))
})
test('background task is defined globally, maps retries and serializes register/unregister without recreating an existing job',async()=>{
 let callback,registered=false;const calls=[];let outcome='retry'
 const mod=loadTs('src/services/backgroundTask.ts',{
  'react-native':{Platform:{OS:'android'}},'./backgroundSync':{runBackgroundSync:async()=>outcome},
  'expo-task-manager':{isTaskDefined:()=>false,defineTask:(name,cb)=>{calls.push('define');callback=cb},isAvailableAsync:async()=>true,isTaskRegisteredAsync:async()=>registered},
  'expo-background-task':{BackgroundTaskResult:{Success:1,Failed:2},BackgroundTaskStatus:{Available:2},getStatusAsync:async()=>2,registerTaskAsync:async(name,options)=>{assert.equal(options.minimumInterval,15);calls.push('register');registered=true},unregisterTaskAsync:async()=>{calls.push('unregister');registered=false}},
 })
 assert.equal(await callback(),2);outcome='synced';assert.equal(await callback(),1)
 await Promise.all([mod.configureBackgroundSync(true),mod.configureBackgroundSync(true),mod.configureBackgroundSync(false)])
 assert.deepEqual(calls,['define','register','unregister'])
})

test('the actual task outbox stops at an owner change and keeps subsequent operations in SQLite',async()=>{
 const {DatabaseSync}=require('node:sqlite');const sql=new DatabaseSync(':memory:')
 sql.exec(`CREATE TABLE operational_task_outbox(idempotency_key TEXT,task_id TEXT,action_type TEXT,payload_json TEXT,created_at INTEGER,status TEXT DEFAULT 'PENDING',attempts INTEGER DEFAULT 0,last_error TEXT,updated_at INTEGER);INSERT INTO operational_task_outbox(idempotency_key,task_id,action_type,payload_json,created_at) VALUES ('one','t1','STATUS','{"status":"DONE"}',1),('two','t2','STATUS','{"status":"DONE"}',2)`)
 const db={getAllSync:q=>sql.prepare(q).all(),runSync:(q,v=[])=>sql.prepare(q).run(...v)}
 let current=true,calls=0
 const mod=loadTs('src/services/taskSync.ts',{'expo-crypto':{},'../../storage/db':{db},'../lib/api':{ApiError,updateOperationalTaskStatus:async()=>{calls++;current=false}}})
 await mod.flushTaskOutbox('token',db,()=>current)
 assert.equal(calls,1);assert.equal(sql.prepare('SELECT idempotency_key FROM operational_task_outbox').get().idempotency_key,'two')
 sql.close()
})
