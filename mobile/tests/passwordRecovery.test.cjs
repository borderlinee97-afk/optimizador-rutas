const test=require('node:test'),assert=require('node:assert/strict')
const {loadTs}=require('./helpers/loadTs.cjs')
const {createRecoveryCodeExchange}=loadTs('src/services/passwordRecovery.ts',{})
test('recovery navigation remounts share one code exchange, including a completed exchange',async()=>{
 let calls=0,resolve;const exchange=createRecoveryCodeExchange(()=>{calls++;return new Promise(r=>resolve=r)})
 const first=exchange('code-a'),second=exchange('code-a');assert.equal(first,second);assert.equal(calls,1)
 resolve({error:null});await first;await exchange('code-a');assert.equal(calls,1)
})
test('an expired code rejects and a new recovery link can be exchanged',async()=>{
 let calls=0;const exchange=createRecoveryCodeExchange(async code=>{calls++;return {error:code==='expired'?{message:'Expired'}:null}})
 await assert.rejects(exchange('expired'),/Expired/);await assert.rejects(exchange('expired'),/Expired/);assert.equal(calls,1)
 await exchange('new');assert.equal(calls,2)
})
