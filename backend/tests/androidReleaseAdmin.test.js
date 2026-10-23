import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Pool} from 'pg'
import {assertUpdateAdmin,parseExpoBuild,fetchExpoBuild,verifyExpoApk,readCurrentAndroidRelease,createAndroidReleaseAdmin} from '../services/androidReleaseAdmin.service.js'
import {ANDROID_PACKAGE,EXPO_PROJECT} from '../services/androidRelease.service.js'
const ID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222'
const actor={id:randomUUID(),system_role:'ADMIN',activo:true}
const build=(id=ID,code=2)=>({id,status:'FINISHED',platform:'ANDROID',buildProfile:'preview',distribution:'INTERNAL',project:{id:EXPO_PROJECT},appVersion:'1.0.0',appBuildVersion:String(code),artifacts:{applicationArchiveUrl:`https://expo.dev/artifacts/eas/${id}.apk`}})
const integrity={sha256:'a'.repeat(64),byteSize:3}

test('only active system administrators can manage releases; operational seniority never grants publication',()=>{
 assert.doesNotThrow(()=>assertUpdateAdmin(actor))
 for(const denied of [null,{...actor,activo:false},{...actor,system_role:null,rol:'DIRECTOR'},{...actor,system_role:'GERENTE'},{...actor,system_role:'ADMIN',activo:'false'}])assert.throws(()=>assertUpdateAdmin(denied),{status:403})
})
test('build links are limited to our Expo project; no arbitrary host, credentials, query or other project',()=>{
 assert.equal(parseExpoBuild(ID),ID)
 assert.equal(parseExpoBuild(`https://expo.dev/accounts/borderline97/projects/app-de-rutas/builds/${ID}`),ID)
 for(const input of ['https://evil.test/'+ID,`https://expo.dev/accounts/other/projects/wrong/builds/${ID}`,`https://expo.dev/accounts/borderline97/projects/app-de-rutas/builds/${ID}?token=x`,'bad'])assert.throws(()=>parseExpoBuild(input),{status:422})
})
test('metadata is obtained from Expo on the server and its access token/errors are never returned to the browser',async()=>{
 let request
 const fetcher=async(url,options)=>{request={url,options};return{ok:true,json:async()=>({data:{builds:{byId:build()}}})}}
 assert.equal((await fetchExpoBuild(ID,{token:'private-token',fetcher})).id,ID)
 assert.equal(request.url,'https://api.expo.dev/graphql');assert.equal(request.options.headers.Authorization,'Bearer private-token')
 await assert.rejects(fetchExpoBuild(ID,{token:'',fetcher}),{code:'EXPO_NOT_CONFIGURED'})
 for(const bad of [{...build(),status:'IN_PROGRESS'},{...build(),project:{id:OTHER}},{...build(),id:OTHER},{...build(),platform:'IOS'},{...build(),appIdentifier:'other.package'}]){
  await assert.rejects(fetchExpoBuild(ID,{token:'private-token',fetcher:async()=>({ok:true,json:async()=>({data:{builds:{byId:bad}}})})}),error=>error.code==='EXPO_BUILD_UNVERIFIED'&&!error.message.includes('private-token'))
 }
})
test('APK verification streams the exact Expo artifact and rejects unavailable or empty downloads',async()=>{
 let url
 const result=await verifyExpoApk(build(),{fetcher:async input=>{url=input;return{ok:true,body:[Buffer.from('abc')]}}})
 assert.equal(url,build().artifacts.applicationArchiveUrl);assert.equal(result.byteSize,3);assert.equal(result.sha256,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
 await assert.rejects(verifyExpoApk(build(),{fetcher:async()=>({ok:true,body:[]})}),{code:'APK_VERIFICATION_FAILED'})
})
test('missing migration preserves the original channel; an initialized withdrawn channel never resurrects file metadata',async()=>{
 const old={versionCode:1}
 assert.equal(await readCurrentAndroidRelease({query:async()=>{throw Object.assign(Error(),{code:'42P01'})}},()=>old),old)
 assert.equal(await readCurrentAndroidRelease({query:async()=>({rows:[{initialized:true,current_build_id:null}]})},()=>old),null)
 await assert.rejects(readCurrentAndroidRelease({query:async()=>{throw Object.assign(Error(),{code:'08006'})}},()=>old))
})

test('persistent migration, approval, concurrent publishing, withdrawal and audit', {skip:!process.env.TEST_ADMIN_DATABASE_URL},async t=>{
 const url=new URL(process.env.TEST_ADMIN_DATABASE_URL)
 assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname),'Local disposable PostgreSQL only')
 const admin=new Pool({connectionString:url.href,max:1}),name='android_updates_'+randomUUID().replaceAll('-',''),createdRoles=[]
 let db,created=false
 try{
  for(const role of ['anon','authenticated','service_role'])if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount){await admin.query('CREATE ROLE '+role+' NOLOGIN');createdRoles.push(role)}
  await admin.query('CREATE DATABASE "'+name+'"');created=true;url.pathname='/'+name;db=new Pool({connectionString:url.href,max:5})
  await db.query('CREATE TABLE public.personas(id uuid PRIMARY KEY,nombre text)')
  await db.query('INSERT INTO public.personas VALUES($1,$2)',[actor.id,'Administrador de prueba'])
  await db.query(await readFile(new URL('../../supabase/migrations/20261023210000_admin_android_updates.sql',import.meta.url),'utf8'))
  let upstreamVersion='1.0.0'
  const getBuild=async id=>({...build(parseExpoBuild(id),parseExpoBuild(id)===ID?2:3),appVersion:upstreamVersion})
  const service=createAndroidReleaseAdmin(db,{getBuild,inspectApk:async()=>integrity,fallback:()=>null,expoConfigured:()=>true})
  await t.test('preparation is persistent and never publishes; duplicate retry does not duplicate audit',async()=>{
   const prepared=await service.prepare(actor,{buildUrl:ID,notes:'Mejoras aprobadas'})
   assert.equal(prepared.release.packageName,ANDROID_PACKAGE)
   assert.equal(await readCurrentAndroidRelease(db,()=>null),null)
   assert.equal((await service.prepare(actor,{buildUrl:ID,notes:'Mejoras aprobadas'})).existing,true)
   assert.equal((await db.query('SELECT count(*)::int n FROM app_android_release_event')).rows[0].n,1)
   await assert.rejects(service.prepare(actor,{buildUrl:ID,notes:'Otras notas'}),{code:'APP_UPDATE_ALREADY_PREPARED'})
  })
  await t.test('only explicit tested approval publishes; repeated successful request is idempotent',async()=>{
   await assert.rejects(service.publish(actor,{buildId:ID,expectedRevision:0,confirmTested:false}),{code:'APP_UPDATE_CONFIRM_REQUIRED'})
   upstreamVersion='9.9.9';await assert.rejects(service.publish(actor,{buildId:ID,expectedRevision:0,confirmTested:true}),{code:'APP_UPDATE_BUILD_CHANGED'});upstreamVersion='1.0.0'
   await service.publish(actor,{buildId:ID,expectedRevision:0,confirmTested:true})
   assert.equal((await readCurrentAndroidRelease(db,()=>null)).versionCode,2)
   assert.equal((await service.publish(actor,{buildId:ID,expectedRevision:0,confirmTested:true})).unchanged,true)
   assert.equal((await service.state(actor)).events.filter(e=>e.action==='PUBLISHED').length,1)
  })
  await t.test('withdrawal persists across restarts, never deletes history and never enables downgrade',async()=>{
   await service.withdraw(actor,{expectedRevision:1,reason:'Retiro de prueba'})
   assert.equal(await readCurrentAndroidRelease(db,()=>({versionCode:1})),null)
   assert.equal((await service.state(actor)).highestVersionCode,2)
   await assert.rejects(service.publish(actor,{buildId:ID,expectedRevision:2,confirmTested:true}),{code:'APP_UPDATE_DOWNGRADE'})
   await assert.rejects(service.withdraw(actor,{expectedRevision:1,reason:'Panel viejo'}),{code:'APP_UPDATE_STALE'})
  })
  await t.test('concurrent publication and withdrawal accept one action; a stale administrator cannot overwrite it',async()=>{
   await service.prepare(actor,{buildUrl:OTHER,notes:'Version siguiente'})
   await service.publish(actor,{buildId:OTHER,expectedRevision:2,confirmTested:true})
   const results=await Promise.allSettled([service.withdraw(actor,{expectedRevision:3,reason:'Retiro concurrente A'}),service.withdraw(actor,{expectedRevision:3,reason:'Retiro concurrente B'})])
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
   assert.equal(results.find(r=>r.status==='rejected').reason.code,'APP_UPDATE_STALE')
   assert.equal((await db.query('SELECT count(*)::int n FROM app_android_release')).rows[0].n,2)
   assert.equal((await service.state(actor)).highestVersionCode,3)
  })
  await t.test('all new tables use RLS and ordinary authenticated users cannot write releases directly',async()=>{
   for(const table of ['app_android_release','app_android_channel','app_android_release_event']){
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass",[table])).rows[0].relrowsecurity,true)
    assert.equal((await db.query("SELECT has_table_privilege('authenticated',$1,'UPDATE') allowed",[table])).rows[0].allowed,false)
   }
   await assert.rejects(service.state({...actor,system_role:null,rol:'GERENTE'}),{status:403})
  })
 }finally{
  if(db)await db.end()
  if(created){assert.match(name,/^android_updates_[a-f0-9]{32}$/);await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)')}
  for(const role of createdRoles.reverse())await admin.query('DROP ROLE '+role)
  await admin.end()
 }
})
