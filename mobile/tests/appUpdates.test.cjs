const test = require('node:test'), assert = require('node:assert/strict')
const { loadTs, hooks } = require('./helpers/loadTs.cjs')
const release = { packageName:'mx.appderutas.supervision',version:'1.0.1',versionCode:3,notes:'Mejoras',publishedAt:'2026-10-23T18:00:00Z',sha256:'a'.repeat(64),byteSize:12345 }
function serviceHarness({ fetcher, applicationId = release.packageName, build = '2', environment = 'standalone', base = 'https://api.example.test' } = {}) {
  const opened = []
  const service = loadTs('src/services/appUpdates.ts', {
    'expo-application':{ nativeApplicationVersion:'1.0.0',nativeBuildVersion:build,applicationId },
    'expo-constants':{default:{executionEnvironment:environment}},
    'react-native':{Platform:{OS:'android'},Linking:{openURL:async url => opened.push(url)}},
  }, { process:{env:{EXPO_PUBLIC_API_URL:base}},URL,fetch:fetcher ?? (async () => ({ok:true,json:async()=>({available:true,release})})) })
  return {service,opened}
}
test('compares native build numbers, ignores older/same releases and rejects a wrong package or bad payload', () => {
  const {service:s} = serviceHarness()
  assert.equal(s.installedBuild,2)
  assert.equal(s.parseRelease({available:true,release},2).status,'available')
  assert.equal(s.parseRelease({available:true,release},3).status,'current')
  assert.equal(s.parseRelease({available:true,release},4).status,'current')
  assert.equal(s.parseRelease({available:false,release:null},2).status,'unpublished')
  for (const patch of [{packageName:'other'}, {versionCode:'3'}, {versionCode:0}, {notes:null}, {publishedAt:'bad'}, {sha256:'bad'}, {byteSize:0}, {byteSize:536870913}]) {
    assert.throws(()=>s.parseRelease({available:true,release:{...release,...patch}},2))
  }
})
test('concurrent checks share a request; uses no token and never opens an untrusted URL from the manifest', async () => {
  let calls=0,finish,request
  const wait = new Promise(resolve => finish=resolve)
  const {service:s,opened}=serviceHarness({fetcher:async(url,options)=>{calls++;request={url,options};await wait;return{ok:true,json:async()=>({available:true,release:{...release,downloadUrl:'https://evil.test/bad.apk'}})}}})
  const a=s.checkAppUpdate(),b=s.checkAppUpdate();assert.equal(a,b);finish();assert.equal((await a).status,'available');assert.equal(calls,1)
  assert.equal(request.url,'https://api.example.test/api/app/android/release');assert.equal(request.options.headers.Authorization,undefined)
  assert.equal(s.updateDownloadUrl(3),'https://api.example.test/api/app/android/download?versionCode=3');assert.equal(opened.length,0)
})
test('failed request can retry, timeout aborts; Expo Go/other app do not check', async () => {
  let calls=0
  const {service:s}=serviceHarness({fetcher:async()=>{if(++calls===1)throw new Error('offline');return{ok:true,json:async()=>({available:false,release:null})}}})
  await assert.rejects(s.checkAppUpdate());assert.equal((await s.checkAppUpdate()).status,'unpublished')
  for(const args of [{environment:'storeClient'},{applicationId:'another.app'},{build:null}]){
    let called=false;const h=serviceHarness({...args,fetcher:()=>{called=true}})
    assert.equal((await h.service.checkAppUpdate()).status,'unsupported');assert.equal(called,false)
  }
  const h=serviceHarness({base:'http://api.example.test'});assert.throws(()=>h.service.updateDownloadUrl(3));assert.equal(h.opened.length,0)
  let callback
  const timeout=loadTs('src/services/appUpdates.ts',{
    'expo-application':{nativeBuildVersion:'2',applicationId:release.packageName},'expo-constants':{default:{executionEnvironment:'standalone'}},
    'react-native':{Platform:{OS:'android'},Linking:{}},
  },{process:{env:{EXPO_PUBLIC_API_URL:'https://api.example.test'}},URL,
    setTimeout:fn=>{callback=fn;return 1},clearTimeout:()=>{},fetch:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout'))))})
  const pending=timeout.checkAppUpdate();callback();await assert.rejects(pending,/timeout/)
})
test('automatic check waits until online/startup grace and is throttled without touching auth or sync',async()=>{
  const h=hooks();let network={isConnected:false,isInternetReachable:false},calls=0,foreground,timers=[]
  const provider=loadTs('src/components/AppUpdateProvider.tsx',{
    ...h.modules,'@react-native-community/netinfo':{useNetInfo:()=>network},
    'react-native':{AppState:{currentState:'active',addEventListener:(_event,fn)=>{foreground=fn;return{remove(){}}}}},
    '../services/appUpdates':{canCheckUpdates:true,checkAppUpdate:async()=>{calls++;return{status:'available',release}}},
    '../services/apkInstallation':{hasApkInstaller:true,canInstallApk:async()=>false,clearInstalledApks:async()=>{},installApprovedApk:async()=>{throw new Error('not requested')}},
  },{setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}})
  h.mount(provider.AppUpdateProvider);await h.flush();foreground();await h.flush();assert.equal(calls,0);await h.value.check();await h.flush();assert.equal(calls,0);assert.ok(h.value.error)
  network={isConnected:true,isInternetReachable:true};h.rerender();await h.flush();assert.equal(calls,0)
  timers.at(-1)();await h.flush();assert.equal(calls,1);assert.equal(h.value.result.status,'available')
  foreground();await h.flush();assert.equal(calls,1)
  h.value.dismiss();await h.flush();assert.equal(h.value.dismissed,true)
  await h.value.check();await h.flush();assert.equal(calls,2);assert.equal(h.value.dismissed,false)
  h.stop()
})


test('only an explicit update starts installation; permission grant resumes once without reopening denied settings',async()=>{
 const h=hooks();let foreground,allowed=false,installs=0
 const provider=loadTs('src/components/AppUpdateProvider.tsx',{
  ...h.modules,'@react-native-community/netinfo':{useNetInfo:()=>({isConnected:true,isInternetReachable:true})},
  'react-native':{AppState:{currentState:'active',addEventListener:(_event,fn)=>{foreground=fn;return{remove(){}}}}},
  '../services/appUpdates':{canCheckUpdates:true,checkAppUpdate:async()=>({status:'available',release})},
  '../services/apkInstallation':{hasApkInstaller:true,clearInstalledApks:async()=>{},canInstallApk:async()=>allowed,
   installApprovedApk:async()=>{installs++;return installs===1?'permission-required':'installer-opened'}},
 },{setTimeout:()=>1,clearTimeout:()=>{}})
 h.mount(provider.AppUpdateProvider);await h.flush();await h.value.check();await h.flush();assert.equal(installs,0)
 await h.value.update();await h.flush();assert.equal(installs,1);assert.equal(h.value.installation.stage,'permission-required')
 foreground();await h.flush();assert.equal(installs,1)
 allowed=true;foreground();await h.flush();assert.equal(installs,2);assert.equal(h.value.installation.stage,'installer-opened')
 foreground();await h.flush();assert.equal(installs,2);h.stop()
})
