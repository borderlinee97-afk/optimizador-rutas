const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto')
const {DatabaseSync}=require('node:sqlite'),{loadTs}=require('./helpers/loadTs.cjs')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
class ApiError extends Error{constructor(message,status,code){super(message);this.status=status;this.code=code}}
function harness(){
 const databases=new Map(),log=[];let owner=A,fail=null,hold=null,badAck=false
 const storage=loadTs('storage/db.ts',{'expo-sqlite':{openDatabaseSync(name){
  if(databases.has(name))return databases.get(name)
  const sql=new DatabaseSync(':memory:');const d={execSync:q=>sql.exec(q),runSync:(q,p=[])=>sql.prepare(q).run(...p),getFirstSync:(q,p=[])=>sql.prepare(q).get(...p)??null,getAllSync:(q,p=[])=>sql.prepare(q).all(...p),
   withTransactionSync(f){sql.exec('BEGIN');try{f();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}},close:()=>sql.close()}
  databases.set(name,d);return d
 }}})
 storage.activateUserDatabase(A)
 const session=()=>({user:{id:owner},access_token:'token-'+owner,expires_at:Date.now()/1000+3600})
 const supabase={auth:{getSession:async()=>({data:{session:session()}}),refreshSession:async()=>({data:{session:session()}})},storage:{from:()=>({uploadToSignedUrl:async()=>({error:null})})}}
 const evidence=loadTs('src/services/evidenceSync.ts',{'../../storage/db':storage,'react-native':{Platform:{OS:'android'}},'expo-file-system':{File:class{async arrayBuffer(){return new Uint8Array([1,2,3]).buffer}}},'../lib/supabase':{supabase},
  '../lib/api':{ApiError,createVisitEvidenceTicket:async(id,p)=>{log.push('PHOTO:'+id);return{evidence:{id:p.evidenceId},upload:{path:'path',token:'signed'}}},completeEvidenceUpload:async(id)=>({ok:true,evidence:{id,status:'READY'}})}})
 const location=loadTs('src/services/offlineVisitLocation.ts',{})
 const service=loadTs('src/services/executionSync.ts',{'expo-crypto':{randomUUID},'../../storage/db':storage,'./offlineVisitLocation':location,'./evidenceSync':evidence,'../lib/supabase':{supabase},'../lib/api':{ApiError,apiRequest:async(_path,options)=>{
  const event=JSON.parse(options.body);log.push(event.action+':'+event.itemId);if(hold)await hold;if(fail)throw fail
  return{ok:!badAck,operationId:badAck?'wrong':event.id,item:{id:event.itemId},activities:event.action==='ACTIVITY_ADDED'?[{id:event.activityId}]:[]}
 }}})
 const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const today=['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-'),plan=randomUUID()
 storage.db.runSync("INSERT INTO plan_cache(cache_key,plan_id,status,synced_at) VALUES('today',?,'APPROVED',?)",[plan,Date.now()])
 function visit(activities=true){const id=randomUUID(),activityId=randomUUID()
  storage.db.runSync("INSERT INTO plan_items(id,plan_id,status,scheduled_date,lat,lng,item_type,source,name) VALUES(?,?,'PENDING',?,20,-103,'PHARMACY','PLAN','Unit')",[id,plan,today])
  if(activities)storage.db.runSync("INSERT INTO plan_item_activities(id,plan_item_id,activity_type,status) VALUES(?,?,'Inventario','PENDING')",[activityId,id])
  return{id,activityId}
 }
 function photo(v,activityId=v.activityId){evidence.queueEvidence({id:randomUUID(),idempotencyKey:randomUUID(),planItemId:v.id,activityId,taskId:null,localUri:'file:///photo.jpg',mimeType:'image/jpeg',byteSize:3,capturedAt:new Date().toISOString(),latitude:20,longitude:-103,accuracyM:5,mocked:false})}
 const profile={id:randomUUID(),activo:true,area:'FARMACIAS',rol:'SUPERVISOR'},now=Date.now()
 let clock=now
 const queue=(v,action,extra={})=>service.queueVisitExecution(A,profile,{itemId:v.id,action,...(action.startsWith('CHECK_')?{lat:20,lng:-103,accuracyM:5}: {activityId:v.activityId}),...extra},clock+=1000)
 return{storage,service,evidence,profile,visit,photo,queue,log,now,fail(e){fail=e},badAck(v){badAck=v},hold(p){hold=p},switchUser(id){owner=id;storage.activateUserDatabase(id)},close(){for(const d of databases.values())d.close()}}
}
test('Airplane flow saves two complete visits and photos; reconnect sends check-in, evidence, activities and check-out in order',async()=>{
 const h=harness(),v1=h.visit(),v2=h.visit()
 h.queue(v1,'CHECK_IN');h.photo(v1);h.queue(v1,'ACTIVITY_DONE',{executionNote:'Inventario revisado'});h.queue(v1,'CHECK_OUT')
 h.queue(v2,'CHECK_IN');h.photo(v2);h.queue(v2,'ACTIVITY_SKIPPED',{skipReason:'Sin responsable'});h.queue(v2,'CHECK_OUT')
 assert.equal(h.log.length,0);assert.equal(h.service.executionSummary().length,6)
 assert.equal(h.storage.db.getFirstSync('SELECT status FROM plan_items WHERE id=?',[v1.id]).status,'DONE')
 assert.throws(()=>h.storage.db.withTransactionSync(()=>{h.storage.db.runSync('DELETE FROM plan_items');throw Error('rollback')}),/rollback/)
 h.storage.deactivateUserDatabase();h.storage.activateUserDatabase(A)
 await h.service.syncVisitExecution(A)
 assert.deepEqual(h.log,[`CHECK_IN:${v1.id}`,`PHOTO:${v1.id}`,`ACTIVITY_DONE:${v1.id}`,`CHECK_OUT:${v1.id}`,`CHECK_IN:${v2.id}`,`PHOTO:${v2.id}`,`ACTIVITY_SKIPPED:${v2.id}`,`CHECK_OUT:${v2.id}`])
 assert.equal(h.service.executionSummary().length,0)
 assert.equal(h.storage.db.getFirstSync('SELECT count(*) n FROM evidence_queue WHERE status=\'READY\'').n,2)
 assert.equal(h.storage.db.getFirstSync('SELECT status FROM plan_items WHERE id=?',[v1.id]).status,'DONE')
 h.close()
})
test('Local safety rejects wrong day, outside geofence, mock GPS, missing photos, unresolved activities and overlapping visits atomically',()=>{
 const h=harness(),v=h.visit(),other=h.visit()
 assert.throws(()=>h.queue(v,'CHECK_IN',{lat:21}),/200 m/)
 assert.throws(()=>h.queue(v,'CHECK_IN',{mocked:true}),/simuladas/)
 assert.equal(h.service.executionSummary().length,0)
 h.queue(v,'CHECK_IN');assert.throws(()=>h.queue(other,'CHECK_IN'),/activa/)
 assert.throws(()=>h.queue(v,'ACTIVITY_DONE'),/fotografía/);assert.throws(()=>h.queue(v,'CHECK_OUT'),/actividades/)
 assert.equal(h.service.executionSummary().length,1);h.photo(v);h.queue(v,'ACTIVITY_DONE');h.queue(v,'CHECK_OUT')
 h.storage.db.runSync("UPDATE plan_items SET scheduled_date='2020-01-01' WHERE id=?",[other.id]);assert.throws(()=>h.queue(other,'CHECK_IN'),/hoy/)
 h.close()
})
test('Connectivity failure retains the exact operation ID; retry cannot overwrite newer local progress',async()=>{
 const h=harness(),v=h.visit();const event=h.queue(v,'CHECK_IN');h.photo(v);h.queue(v,'ACTIVITY_DONE');h.queue(v,'CHECK_OUT')
 h.fail(new ApiError('offline',0));await h.service.syncVisitExecution(A)
 assert.equal(h.service.executionSummary()[0].id,event.id);assert.equal(h.service.executionSummary()[0].status,'PENDING')
 h.fail(null);await h.service.syncVisitExecution(A)
 assert.equal(h.service.executionSummary().length,0);assert.equal(h.storage.db.getFirstSync('SELECT status FROM plan_items WHERE id=?',[v.id]).status,'DONE');h.close()
})
test('A server conflict stays visible and blocks later events; user retry preserves original data',async()=>{
 const h=harness(),v=h.visit();const event=h.queue(v,'CHECK_IN');h.photo(v);h.queue(v,'ACTIVITY_DONE')
 h.fail(new ApiError('Plan changed',409,'PLAN_NOT_APPROVED'));await h.service.syncVisitExecution(A)
 assert.equal(h.service.executionSummary()[0].status,'FAILED');assert.equal(h.log.length,1)
 await h.service.syncVisitExecution(A);assert.equal(h.log.length,1)
 h.service.retryFailedVisitExecution(A);assert.equal(h.service.executionSummary()[0].id,event.id)
 h.fail(null);await h.service.syncVisitExecution(A);assert.equal(h.service.executionSummary().length,0);h.close()
})
test('Concurrent reconnects share one drain and cross-account callbacks cannot upload the old account queue',async()=>{
 const h=harness(),v=h.visit();h.queue(v,'CHECK_IN');h.photo(v);h.queue(v,'ACTIVITY_DONE')
 let release;h.hold(new Promise(r=>release=r));const a=h.service.syncVisitExecution(A),b=h.service.syncVisitExecution(A);assert.equal(a,b)
 await new Promise(r=>setImmediate(r));h.switchUser(B);release();await a
 assert.equal(h.log.length,1);assert.equal(h.service.executionSummary().length,0)
 assert.throws(()=>h.queue(v,'CHECK_OUT'),/cuenta/)
 h.switchUser(A);assert.equal(h.service.executionSummary().length,1);h.hold(null);await h.service.syncVisitExecution(A);assert.equal(h.service.executionSummary().length,0);h.close()
})
test('An invalid server acknowledgment never marks a visit as synchronized',async()=>{
 const h=harness(),v=h.visit();h.queue(v,'CHECK_IN');h.badAck(true);await h.service.syncVisitExecution(A)
 assert.equal(h.service.executionSummary()[0].status,'PENDING');h.close()
})


test('Additional activities survive restart, keep planned activities and sync before their photos and resolution',async()=>{
 const h=harness(),v=h.visit()
 h.queue(v,'CHECK_IN');await h.service.syncVisitExecution(A)
 const original=h.storage.db.getFirstSync('SELECT * FROM plan_item_activities WHERE id=?',[v.activityId])
 const added=h.queue(v,'ACTIVITY_ADDED',{activityType:'  Conteo adicional  ',note:'  Diferencia detectada  '})
 assert.notEqual(added.activityId,v.activityId)
 assert.deepEqual(h.storage.db.getFirstSync('SELECT * FROM plan_item_activities WHERE id=?',[v.activityId]),original)
 const row=h.storage.db.getFirstSync('SELECT * FROM plan_item_activities WHERE id=?',[added.activityId])
 assert.equal(row.activity_type,'Conteo adicional');assert.equal(row.note,'Diferencia detectada');assert.equal(row.ord,2)
 h.photo(v,added.activityId)
 await h.evidence.syncPendingEvidence('')
 assert.deepEqual(h.log,['CHECK_IN:'+v.id])
 h.photo(v);h.queue(v,'ACTIVITY_DONE')
 assert.throws(()=>h.queue(v,'CHECK_OUT'),/actividades/)
 h.queue(v,'ACTIVITY_DONE',{activityId:added.activityId});h.queue(v,'CHECK_OUT')
 h.storage.deactivateUserDatabase();h.storage.activateUserDatabase(A)
 h.fail(new ApiError('offline',0));await h.service.syncVisitExecution(A);h.fail(null)
 await h.service.syncVisitExecution(A)
 const addIndex=h.log.indexOf('ACTIVITY_ADDED:'+v.id)
 assert.ok(addIndex>=0)
 assert.ok(h.log.lastIndexOf('PHOTO:'+v.id)>addIndex)
 assert.equal(h.service.executionSummary().length,0)
 assert.equal(h.storage.db.getFirstSync('SELECT count(*) n FROM plan_item_activities WHERE plan_item_id=?',[v.id]).n,2)
 assert.equal(h.storage.db.getFirstSync('SELECT status FROM plan_item_activities WHERE id=?',[added.activityId]).status,'DONE')
 h.close()
})

test('Additional activity rules reject missing check-in, closed visit, invalid inputs, wrong source and more than fifty atomically',()=>{
 const h=harness(),v=h.visit()
 assert.throws(()=>h.queue(v,'ACTIVITY_ADDED',{activityType:'Nueva'}),/check-in/)
 h.queue(v,'CHECK_IN')
 for(const input of [{activityType:' '},{activityType:'x'.repeat(161)},{activityType:'Nueva',note:'x'.repeat(1001)}])assert.throws(()=>h.queue(v,'ACTIVITY_ADDED',input),/160/)
 h.storage.db.runSync("UPDATE plan_items SET source='HIERARCHY_ASSIGNED' WHERE id=?",[v.id])
 assert.throws(()=>h.queue(v,'ACTIVITY_ADDED',{activityType:'Nueva'}),/adicionales/)
 h.storage.db.runSync("UPDATE plan_items SET source='PLAN' WHERE id=?",[v.id])
 for(let i=1;i<50;i++)h.storage.db.runSync("INSERT INTO plan_item_activities(id,plan_item_id,activity_type,ord,status) VALUES(?,?,?,?,'PENDING')",[randomUUID(),v.id,'Actividad '+i,i+1])
 assert.throws(()=>h.queue(v,'ACTIVITY_ADDED',{activityType:'Extra'}),/50/)
 assert.equal(h.service.executionSummary().length,1)
 h.storage.db.runSync("UPDATE plan_items SET status='DONE' WHERE id=?",[v.id])
 assert.throws(()=>h.queue(v,'ACTIVITY_ADDED',{activityType:'Nueva'}),/check-in/)
 h.close()
})


test('explicit retry includes failed photos before refreshing today, without changing evidence identifiers', async () => {
 const h=harness(),v=h.visit();h.queue(v,'CHECK_IN');await h.service.syncVisitExecution(A);h.photo(v)
 h.storage.db.runSync("UPDATE evidence_queue SET status='FAILED',last_error='old upload limit'")
 const original=h.storage.db.getFirstSync('SELECT evidence_id,local_uri FROM evidence_queue')
 let refreshed=0
 await h.service.retryPendingVisitSync(A,async()=>{
  refreshed++;assert.equal(h.service.executionSummary().length,0)
  assert.equal(h.storage.db.getFirstSync('SELECT status FROM evidence_queue').status,'READY')
 })
 assert.equal(refreshed,1)
 assert.deepEqual(h.storage.db.getFirstSync('SELECT evidence_id,local_uri FROM evidence_queue'),original)
 h.close()
})

test('a permanent server conflict remains pending for review; retry does not discard or falsely acknowledge it',async()=>{
 const h=harness(),v=h.visit();const event=h.queue(v,'CHECK_IN')
 h.fail(new ApiError('Visita cerrada administrativamente',409,'ITEM_NOT_IN_PROGRESS'))
 await h.service.retryPendingVisitSync(A,async()=>{})
 const rows=h.service.executionSummary();assert.equal(rows.length,1);assert.equal(rows[0].id,event.id)
 assert.equal(rows[0].status,'FAILED');assert.match(rows[0].last_error,/administrativamente/)
 h.close()
})

test('manual sync does not refresh another account after a switch during execution upload',async()=>{
 const h=harness(),v=h.visit();h.queue(v,'CHECK_IN');h.photo(v)
 let release,refreshed=0;h.hold(new Promise(r=>release=r))
 const sync=h.service.retryPendingVisitSync(A,async()=>{refreshed++})
 await new Promise(r=>setImmediate(r));h.switchUser(B);release();await sync
 assert.equal(refreshed,0);assert.equal(h.log.filter(x=>x.startsWith('PHOTO:')).length,0)
 h.switchUser(A);assert.equal(h.storage.db.getFirstSync('SELECT status FROM evidence_queue').status,'PENDING')
 h.close()
})
