import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
process.env.DATABASE_URL ||= 'postgresql://unused@127.0.0.1/unused'
process.env.SUPABASE_URL ||= 'https://test.supabase.co'
process.env.SUPABASE_PUBLISHABLE_KEY ||= 'sb_publishable_test_only'
const {createAdminAndroidUpdatesRouter}=await import('../routes/web.androidUpdates.route.js')
const admin={id:'11111111-1111-4111-8111-111111111111',activo:true,system_role:'ADMIN'}
async function server(run,{fail=false}={}){
 const calls=[],app=express();app.use(express.json())
 const service=Object.fromEntries(['state','prepare','publish','withdraw'].map(action=>[action,async actor=>{calls.push(action);assert.equal(actor.id,admin.id);if(fail)throw Error('private database secret');return{ok:true}}]))
 app.use('/updates',createAdminAndroidUpdatesRouter({service,auth:(req,res,next)=>{
  if(!req.headers.authorization)return res.status(401).json({error:'Sesión requerida'})
  req.auth={user:{id:'auth-user'}};next()
 },profile:(req,res,next)=>{req.identityProfile=req.headers.authorization==='Bearer admin'?admin:req.headers.authorization==='Bearer inactive'?{...admin,activo:false}:{...admin,system_role:null,rol:'GERENTE'};next()}}))
 const listener=app.listen(0,'127.0.0.1');await new Promise(r=>listener.once('listening',r))
 try{await run('http://127.0.0.1:'+listener.address().port,calls)}finally{listener.closeAllConnections();await new Promise(r=>listener.close(r))}
}
test('all panel endpoints reject missing sessions, operational managers and inactive admins before service execution',async()=>{
 await server(async(base,calls)=>{
  for(const token of [null,'Bearer manager','Bearer inactive'])for(const path of ['','/prepare','/publish','/withdraw']){
   const response=await fetch(base+'/updates'+path,{method:path?'POST':'GET',headers:{...(token?{Authorization:token}:{}),'Content-Type':'application/json'},...(path?{body:JSON.stringify({system_role:'ADMIN',confirmTested:true})}:{})})
   assert.equal(response.status,token?403:401)
  }
  assert.equal(calls.length,0)
 })
})
test('active admin can invoke all actions; errors and cache headers disclose no private backend information',async()=>{
 await server(async(base,calls)=>{
  for(const path of ['','/prepare','/publish','/withdraw']){
   const response=await fetch(base+'/updates'+path,{method:path?'POST':'GET',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},...(path?{body:'{}'}:{})})
   assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
  }
  assert.deepEqual(calls,['state','prepare','publish','withdraw'])
 })
 await server(async base=>{const response=await fetch(base+'/updates',{headers:{Authorization:'Bearer admin'}});assert.equal(response.status,500);assert.ok(!(await response.text()).includes('secret'))},{fail:true})
})


test('admin router is mounted after app creation and the existing session/profile guard',async()=>{
 const {readFile}=await import('node:fs/promises')
 const source=(await readFile(new URL('../index.js',import.meta.url),'utf8')).replaceAll('\r\n','\n')
 const mount=source.indexOf("app.use('/api/web/admin/android-updates', adminAndroidUpdatesRouter)")
 assert.ok(mount>0);assert.ok(source.indexOf('  requireOperationalProfile,\n)')>0)
 assert.ok(mount>source.indexOf('const app ='))
 assert.ok(mount>source.indexOf('  requireOperationalProfile,\n)'))
 assert.ok(source.indexOf('app.use(createAndroidReleaseRouter(')<source.indexOf('  requireOperationalProfile,\n)'))
})
