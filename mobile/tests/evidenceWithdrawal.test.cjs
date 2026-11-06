const test=require('node:test'),assert=require('node:assert/strict')
const {DatabaseSync}=require('node:sqlite')
const {loadTs}=require('./helpers/loadTs.cjs')
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222'
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function harness(options={}) {
  const stores=[]
  const storage=loadTs('storage/db.ts',{'expo-sqlite':{openDatabaseSync(){const sql=new DatabaseSync(':memory:');stores.push(sql);return {
    execSync:q=>sql.exec(q),runSync:(q,p=[])=>sql.prepare(q).run(...p),getFirstSync:(q,p=[])=>sql.prepare(q).get(...p)||null,getAllSync:(q,p=[])=>sql.prepare(q).all(...p),
    withTransactionSync(fn){sql.exec('BEGIN');try{fn();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}
  }}}})
  storage.activateUserDatabase(A)
  const calls=[],original=storage.db
  let user=A
  class ApiError extends Error{}
  const service=loadTs('src/services/evidenceSync.ts',{'../../storage/db':storage,'react-native':{Platform:{OS:'android'}},'expo-file-system':{File:class{async arrayBuffer(){return new Uint8Array([1,2,3]).buffer}}},
    '../lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:'fresh',expires_at:Date.now()/1000+3600}}})},storage:{from:()=>({uploadToSignedUrl:async()=>{calls.push('storage');return {}}})}}},
    '../lib/api':{ApiError,createVisitEvidenceTicket:async()=>{calls.push('ticket');if(options.uploadGate)await options.uploadGate;return {evidence:{status:'PENDING_UPLOAD'},upload:{path:'private',token:'signed'}}},
      completeEvidenceUpload:async()=>{calls.push('complete');return {evidence:{status:'READY'}}},
      removeVisitEvidence:async(item,id,token)=>{calls.push('remove');assert.equal(token,'fresh');if(options.removeGate)await options.removeGate;if(options.failure)throw new Error('Sin conexión');return {ok:true,removed:true}}
    }
  })
  const photo=id=>({id,idempotencyKey:id,planItemId:'visit',activityId:null,taskId:null,localUri:'file:///private/'+id+'.jpg',mimeType:'image/jpeg',byteSize:3,capturedAt:'2026-11-06T12:00:00Z',latitude:19,longitude:-98,accuracyM:10,mocked:false})
  return {service,storage,original,calls,queue(id='photo'){service.queueEvidence(photo(id))},switch(){user=B;storage.activateUserDatabase(B)},close(){stores.forEach(s=>s.close())}}
}
test('withdrawal confirms online before hiding a pending capture and does not discard its file',async()=>{
 const h=harness();try{h.queue();await h.service.withdrawVisitEvidence('visit','photo','old');assert.deepEqual(h.calls,['remove']);assert.equal(h.service.listLocalEvidence({planItemId:'visit'}).length,0);assert.equal(h.service.isEvidenceRemoved('photo'),true);await h.service.syncPendingEvidence('old');assert.deepEqual(h.calls,['remove'])}finally{h.close()}
})
test('network failure keeps the photo and queue intact for a later retry',async()=>{
 const options={failure:true},h=harness(options);try{h.queue();await assert.rejects(h.service.withdrawVisitEvidence('visit','photo','old'),/Sin conexión/);assert.equal(h.service.listLocalEvidence({planItemId:'visit'}).length,1);assert.equal(h.service.isEvidenceRemoved('photo'),false);options.failure=false;await h.service.withdrawVisitEvidence('visit','photo','old');assert.equal(h.service.isEvidenceRemoved('photo'),true)}finally{h.close()}
})
test('withdrawal waits for an upload, blocks another batch and never resurrects the queue',async()=>{
 const upload=deferred(),remove=deferred(),h=harness({uploadGate:upload.promise,removeGate:remove.promise})
 try{h.queue();const syncing=h.service.syncPendingEvidence('old');const removing=h.service.withdrawVisitEvidence('visit','photo','old');await new Promise(setImmediate);assert.deepEqual(h.calls,['ticket']);upload.resolve();await syncing;await new Promise(setImmediate);assert.deepEqual(h.calls,['ticket','storage','complete','remove']);const second=h.service.syncPendingEvidence('old',true);remove.resolve();await Promise.all([removing,second]);assert.equal(h.service.listLocalEvidence({planItemId:'visit'}).length,0);assert.equal(h.calls.filter(c=>c==='ticket').length,1)}finally{h.close()}
})
test('a response after switching accounts writes the withdrawal only to its original database',async()=>{
 const gate=deferred(),h=harness({removeGate:gate.promise});try{h.queue();const removing=h.service.withdrawVisitEvidence('visit','photo','old');await new Promise(setImmediate);h.switch();h.queue('new-account-photo');gate.resolve();await removing;assert.ok(h.original.getFirstSync('SELECT 1 FROM evidence_removals WHERE evidence_id=?',['photo']));assert.equal(h.service.isEvidenceRemoved('photo'),false);assert.equal(h.service.listLocalEvidence({planItemId:'visit'}).length,1)}finally{h.close()}
})
