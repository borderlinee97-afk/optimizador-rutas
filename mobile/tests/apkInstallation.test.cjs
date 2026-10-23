const test=require('node:test'),assert=require('node:assert/strict')
const {loadTs}=require('./helpers/loadTs.cjs')
const release={packageName:'mx.appderutas.supervision',version:'1.0.1',versionCode:3,sha256:'a'.repeat(64),byteSize:12345,notes:'Mejoras',publishedAt:'2026-10-23T18:00:00Z'}
function harness(options={}) {
  let exists=options.cached??false,size=exists?release.byteSize:0,checks=0,downloads=0,installs=0,pauses=0
  const removed=[],urls=[],progress=[],timers=[];let validationError=options.validationError,latest={status:'available',release}
  const installer={canInstallAsync:async()=>true,clearInstalledAsync:async()=>{},downloadPathAsync:async code=>`file:///cache/app-updates/update-${code}.apk`,
    installAsync:async(code,hash,bytes)=>{installs++;assert.equal(code,3);assert.equal(hash,release.sha256);assert.equal(bytes,release.byteSize);if(validationError)throw Error(validationError);return options.permission?'permission-required':'installer-opened'}}
  const fs={getInfoAsync:async()=>exists?{exists:true,size}:{exists:false},deleteAsync:async path=>{removed.push(path);exists=false;size=0},
    createDownloadResumable(url,path,_options,onProgress){urls.push(url);return{pauseAsync:async()=>{pauses++},downloadAsync:async()=>{
      downloads++;if(options.stall)return new Promise(()=>{})
      onProgress({totalBytesWritten:6000,totalBytesExpectedToWrite:release.byteSize});exists=true;size=release.byteSize
      if(options.withdrawAfterDownload)latest={status:'unpublished'}
      return{uri:path,status:options.status??200}
    }}}
  }
  const service=loadTs('src/services/apkInstallation.ts',{
    expo:{requireOptionalNativeModule:()=>options.missing?null:installer},'react-native':{Platform:{OS:'android'}},'expo-file-system/legacy':fs,
    './appUpdates':{checkAppUpdate:async()=>{checks++;return latest},updateDownloadUrl:code=>`https://api.test/api/app/android/download?versionCode=${code}`},
  },options.stall?{setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}}:{})
  return{service,progress,removed,urls,timers,installer,fs,latest(value){latest=value},validation(value){validationError=value},get checks(){return checks},get downloads(){return downloads},get installs(){return installs},get pauses(){return pauses}}
}
test('one tap downloads privately, shows progress, rechecks publication and opens Android installer without browser',async()=>{
  const h=harness(),a=h.service.installApprovedApk(release,v=>h.progress.push(v)),b=h.service.installApprovedApk(release,()=>{})
  assert.equal(a,b);assert.equal(await a,'installer-opened');assert.equal(h.downloads,1);assert.equal(h.installs,1);assert.equal(h.checks,2)
  assert.equal(h.urls[0],'https://api.test/api/app/android/download?versionCode=3')
  assert.ok(h.progress.some(p=>p.stage==='downloading'&&p.percent>0));assert.equal(h.progress.at(-1).stage,'verifying');assert.equal(h.removed.length,0)
})
test('permission return/cancel retries reuse the cached APK and verify it again instead of downloading again',async()=>{
  const h=harness({permission:true});assert.equal(await h.service.installApprovedApk(release,()=>{}),'permission-required')
  assert.equal(await h.service.installApprovedApk(release,()=>{}),'permission-required');assert.equal(h.downloads,1);assert.equal(h.installs,2);assert.equal(h.removed.length,0)
})
test('withdrawn release and download error never reach installer; only updater cache is removed',async()=>{
  for(const options of [{withdrawAfterDownload:true},{status:409}]){
    const h=harness(options);await assert.rejects(h.service.installApprovedApk(release,()=>{}));assert.equal(h.installs,0)
    assert.deepEqual(h.removed,['file:///cache/app-updates/update-3.apk'])
  }
  const h=harness();h.latest({status:'unpublished'});await assert.rejects(h.service.installApprovedApk(release,()=>{}));assert.equal(h.downloads,0);assert.equal(h.installs,0)
})
test('invalid hash/signature failure discards cached APK; retry downloads anew and validation is never bypassed',async()=>{
  const h=harness({cached:true,validationError:'La firma de la APK no coincide.'})
  await assert.rejects(h.service.installApprovedApk(release,()=>{}),/firma/);assert.equal(h.downloads,0);assert.equal(h.installs,1);assert.equal(h.removed.length,1)
  h.validation(null);assert.equal(await h.service.installApprovedApk(release,()=>{}),'installer-opened');assert.equal(h.downloads,1);assert.equal(h.installs,2)
})
test('missing native installer fails clearly; stalled transfer is paused and never installs a partial APK',async()=>{
  const absent=harness({missing:true});await assert.rejects(absent.service.installApprovedApk(release,()=>{}),/primera actualización manual/)
  const h=harness({stall:true});const promise=h.service.installApprovedApk(release,()=>{})
  await new Promise(r=>setImmediate(r));h.timers.at(-1)();await assert.rejects(promise,/interrumpió/);assert.ok(h.pauses>0);assert.equal(h.installs,0);assert.equal(h.removed.length,1)
})

test('native Java policy verifies real hash/size, package, version, signature and keeps paths within own cache',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util')
  const run=promisify(execFile),dir=fs.mkdtempSync(path.join(os.tmpdir(),'routes-apk-policy-'))
  try{
    const main=path.join(dir,'ApkCheck.java')
    fs.writeFileSync(main,`import mx.appderutas.updates.ApkPolicy;
import java.io.*; import java.nio.file.*; import java.util.*;
public class ApkCheck {
 interface Work { void run() throws Exception; }
 static void rejects(Work work) throws Exception { try { work.run(); } catch(Exception expected) { return; } throw new Error("Validation was bypassed"); }
 public static void main(String[] args) throws Exception {
  File root=new File(args[0]);File apk=ApkPolicy.apkFile(root,3);apk.getParentFile().mkdirs();Files.write(apk.toPath(),"abc".getBytes("UTF-8"));
  String hash="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  ApkPolicy.verifyFile(apk,3,hash);rejects(()->ApkPolicy.verifyFile(apk,4,hash));rejects(()->ApkPolicy.verifyFile(apk,3,"0".repeat(64)));
  rejects(()->ApkPolicy.verifyFile(apk,Double.NaN,hash));rejects(()->ApkPolicy.verifyFile(apk,ApkPolicy.MAX_BYTES+1,hash));
  rejects(()->ApkPolicy.version(0));rejects(()->ApkPolicy.version(1.5));rejects(()->ApkPolicy.version(Double.NaN));
  String pkg="mx.appderutas.supervision";Set<String> signer=Set.of("approved");
  ApkPolicy.verifyIdentity(pkg,2,signer,pkg,3,signer,3);
  rejects(()->ApkPolicy.verifyIdentity(pkg,2,signer,"another.app",3,signer,3));
  rejects(()->ApkPolicy.verifyIdentity(pkg,2,signer,pkg,3,Set.of("different"),3));
  rejects(()->ApkPolicy.verifyIdentity(pkg,2,Set.of(),pkg,3,Set.of(),3));
  rejects(()->ApkPolicy.verifyIdentity(pkg,3,signer,pkg,3,signer,3));
  rejects(()->ApkPolicy.verifyIdentity(pkg,2,signer,pkg,4,signer,3));
  if(!apk.getCanonicalFile().getParentFile().getParentFile().equals(root.getCanonicalFile()))throw new Error("Unsafe path");
  System.out.println("Native policy OK");
 }
}`)
    const source=path.resolve(__dirname,'../modules/internal-apk-updater/android/src/main/java/mx/appderutas/updates/ApkPolicy.java')
    await run('javac',['-encoding','UTF-8','-d',dir,source,main]);const result=await run('java',['-cp',dir,'ApkCheck',dir]);assert.match(result.stdout,/Native policy OK/)
  }finally{
    const target=path.resolve(dir),parent=path.resolve(os.tmpdir())
    if(path.dirname(target)!==parent||!path.basename(target).startsWith('routes-apk-policy-'))throw Error('Invalid test directory')
    fs.rmSync(target,{recursive:true,force:true})
  }
})
