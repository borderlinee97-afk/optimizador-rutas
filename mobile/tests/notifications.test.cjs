const test=require('node:test'),assert=require('node:assert/strict')
const {loadTs}=require('./helpers/loadTs.cjs')
const {DatabaseSync}=require('node:sqlite')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
function notificationsHarness() {
 const memory=new Map();let permission={granted:false,canAskAgain:true},asked=0,handler,scheduled=[]
 const api=[]
 const adapter={AndroidImportance:{DEFAULT:3},SchedulableTriggerInputTypes:{TIME_INTERVAL:'timeInterval'},setNotificationHandler(value){handler=value},setNotificationChannelAsync:async()=>{},getPermissionsAsync:async()=>permission,requestPermissionsAsync:async()=>{asked++;return permission},getExpoPushTokenAsync:async()=>({data:'ExpoPushToken[test]'}),scheduleNotificationAsync:async value=>scheduled.push(value)}
 const service=loadTs('src/services/notifications.ts',{
  '@react-native-async-storage/async-storage':{default:{getItem:async k=>memory.get(k),setItem:async(k,v)=>memory.set(k,v)}},
  'expo-constants':{default:{executionEnvironment:'standalone',easConfig:{projectId:A}}},'expo-crypto':{randomUUID:()=>A},'expo-device':{isDevice:true},'expo-notifications':adapter,
  'react-native':{Platform:{OS:'android'}},'../lib/api':{apiRequest:async(...args)=>api.push(args)},
 })
 return{service,adapter,api,scheduled,get asked(){return asked},get handler(){return handler},permission(value){permission=value}}
}
test('Permission denial is requested only once; granting via settings enables local notifications',async()=>{
 const h=notificationsHarness();await h.service.prepareNotifications();await h.service.prepareNotifications();assert.equal(h.asked,1)
 await h.service.notifySyncCompleted(A,()=>true);assert.equal(h.scheduled.length,0)
 h.permission({granted:true,canAskAgain:true});await h.service.notifySyncCompleted(A,()=>false);assert.equal(h.scheduled.length,0)
 await h.service.notifySyncCompleted(A,()=>true);assert.equal(h.scheduled.length,1);assert.equal(h.scheduled[0].content.data.recipientAuthId,A)
})
test('Notifications navigate only for the intended account and role; stale registration is suppressed',async()=>{
 const h=notificationsHarness(),s=h.service,data={recipientAuthId:A,kind:'PLAN_SUBMITTED',planId:B}
 assert.equal(s.notificationDestination(data,A,'COORDINADOR'),'/(tabs)/approvals');assert.equal(s.notificationDestination(data,B,'COORDINADOR'),null)
 assert.equal(s.notificationDestination(data,A,'SUPERVISOR'),null);assert.equal(s.notificationDestination({...data,planId:'bad'},A,'GERENTE'),null)
 assert.equal(s.notificationDestination({...data,kind:'PLAN_APPROVED'},A,'SUPERVISOR'),`/work-plans/${B}`)
 s.setNotificationOwner(A);assert.equal((await h.handler.handleNotification({request:{content:{data:{recipientAuthId:B}}}})).shouldShowBanner,false)
 s.setNotificationOwner(null);assert.equal((await h.handler.handleNotification({request:{content:{data:{recipientAuthId:A}}}})).shouldShowBanner,false)
 await s.registerNotifications('token',()=>false);assert.equal(h.api.length,0)
 await s.registerNotifications('token',()=>true);assert.equal(h.api.length,1)
})
function syncHarness() {
 const database=new DatabaseSync(':memory:');database.exec('CREATE TABLE evidence_queue(status TEXT);CREATE TABLE operational_task_outbox(status TEXT);CREATE TABLE execution_outbox(status TEXT)')
 const db={getFirstSync:(q)=>database.prepare(q).get()};let owner=A,done=0,hold,started=0
 const service=loadTs('src/services/offlineSyncNotifications.ts',{
  './executionSync':{syncVisitExecution:async()=>{}},
  '../../storage/db':{db,isDatabaseActive:id=>id===owner},'../lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:owner},access_token:'token'}}})}}},
  './taskSync':{flushTaskOutbox:async()=>{started++;if(hold)await hold;database.exec("DELETE FROM operational_task_outbox WHERE status='PENDING'")}},
  './evidenceSync':{syncPendingEvidence:async()=>database.exec("UPDATE evidence_queue SET status='READY' WHERE status='PENDING'")},
 })
 return{database,service,monitor:service.createSyncMonitor(A,()=>owner===A,async()=>{done++}),get done(){return done},get started(){return started},hold(p){hold=p},owner(id){owner=id}}
}
test('Reconnection reports completion once, suppresses empty refreshes, failed rows and old execution pending',async()=>{
 const h=syncHarness();await h.monitor.sync();assert.equal(h.done,0)
 h.database.exec("INSERT INTO evidence_queue VALUES('PENDING');INSERT INTO operational_task_outbox VALUES('PENDING');INSERT INTO execution_outbox VALUES('FAILED')")
 h.monitor.observe();await h.monitor.sync();assert.equal(h.done,0)
 h.database.exec("UPDATE execution_outbox SET status='SYNCED'");await h.monitor.sync();assert.equal(h.done,1)
 await h.monitor.sync();assert.equal(h.done,1)
 h.database.exec("INSERT INTO evidence_queue VALUES('FAILED')");await h.monitor.sync();assert.equal(h.done,1);h.database.close()
})
test('Concurrent reconnects share a drain and a late response never notifies another user',async()=>{
 const h=syncHarness();h.database.exec("INSERT INTO operational_task_outbox VALUES('PENDING')")
 let release;h.hold(new Promise(r=>release=r));const a=h.monitor.sync(),b=h.monitor.sync();assert.equal(a,b)
 await new Promise(r=>setImmediate(r));h.owner(B);release();await a;assert.equal(h.started,1);assert.equal(h.done,0);h.database.close()
})
test('Task drain is deduplicated while a screen and reconnect worker run together',async()=>{
 const database=new DatabaseSync(':memory:');database.exec("CREATE TABLE operational_task_outbox(idempotency_key TEXT,task_id TEXT,action_type TEXT,payload_json TEXT,status TEXT,created_at INT);INSERT INTO operational_task_outbox VALUES('key','task','COMMENT','{\"body\":\"note\"}','PENDING',0)")
 const db={getAllSync:q=>database.prepare(q).all(),runSync:(q,p)=>database.prepare(q).run(...p)}
 let release,calls=0;const pending=new Promise(r=>release=r)
 const s=loadTs('src/services/taskSync.ts',{'expo-crypto':{},'../../storage/db':{db},'../lib/api':{ApiError:class extends Error{},addOperationalTaskComment:async()=>{calls++;await pending}}})
 const a=s.flushTaskOutbox('token'),b=s.flushTaskOutbox('token');assert.equal(a,b);release();await a;assert.equal(calls,1);database.close()
})
test('Offline banner is hidden on an online network even with preserved legacy data',()=>{
 let network={isConnected:true,isInternetReachable:true}
 const {OfflineStatus}=loadTs('src/components/OfflineStatus.tsx',{
  '@react-native-community/netinfo':{useNetInfo:()=>network},'react-native':{Pressable:'p',Text:'t',View:'v'},'expo-router':{router:{}},'react-native-safe-area-context':{SafeAreaView:'s'},
  '../context/AuthContext':{useAuth:()=>({profile:{area:'FARMACIAS',rol:'SUPERVISOR'},legacyDataPreserved:true})},'../context/PlanContext':{usePlan:()=>({})},
  'react/jsx-runtime':{jsx:(t,p)=>({t,p}),jsxs:(t,p)=>({t,p})},
 })
 assert.equal(OfflineStatus(),null);network={isConnected:null,isInternetReachable:null};assert.equal(OfflineStatus(),null)
 network={isConnected:false,isInternetReachable:false};assert.ok(OfflineStatus())
})
