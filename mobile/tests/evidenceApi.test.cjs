const test=require('node:test'),assert=require('node:assert/strict')
const {loadTs}=require('./helpers/loadTs.cjs')
function harness(){const calls=[],resolvers=[];const api=loadTs('src/lib/api.ts',{'../services/sessionRenewal':{renewRequestToken:async token=>token}},{Headers,process:{env:{EXPO_PUBLIC_API_URL:'https://example.invalid'}},fetch:async(url,options)=>{calls.push({url,options});return new Promise(resolve=>resolvers.push(()=>resolve({ok:true,status:200,headers:new Headers(),text:async()=>JSON.stringify({evidence:[],ok:true,removed:true})})))}});return {api,calls,resolve(){resolvers.splice(0).forEach(fn=>fn())}}}
test('simultaneous activity galleries share one read, separate sessions do not, and later opens renew URLs',async()=>{
 const h=harness(),one=h.api.listVisitEvidence('visit','session-a'),two=h.api.listVisitEvidence('visit','session-a'),other=h.api.listVisitEvidence('visit','session-b')
 assert.equal(one,two);assert.notEqual(one,other);assert.equal(h.calls.length,2);h.resolve();await Promise.all([one,two,other]);const next=h.api.listVisitEvidence('visit','session-a');assert.equal(h.calls.length,3);h.resolve();await next
})
test('removal uses the authorized visit endpoint and DELETE',async()=>{
 const h=harness(),pending=h.api.removeVisitEvidence('visit','photo','session-a');assert.equal(h.calls[0].url,'https://example.invalid/api/mobile/evidence/items/visit/photo');assert.equal(h.calls[0].options.method,'DELETE');assert.equal(h.calls[0].options.headers.get('Authorization'),'Bearer session-a');h.resolve();await pending
})
