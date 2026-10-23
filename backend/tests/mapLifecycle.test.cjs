const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),vue=require('../../node_modules/vue')
function harness(){
 const pending=[],maps=[],cleanup=[]
 const source=fs.readFileSync(require.resolve('../../src/composables/useMap.js'),'utf8').replace(/import[^\n]+\n/,'').replace('export function','function')
 const google={maps:{importLibrary:name=>new Promise(resolve=>pending.push({name,resolve})),InfoWindow:class{},TrafficLayer:class{setMap(){}},LatLngBounds:class{isEmpty(){return true}},event:{removeListener(){}}}}
 const ctx={ref:vue.ref,shallowRef:vue.shallowRef,onBeforeUnmount:fn=>cleanup.push(fn),window:{google},google}
 vm.runInNewContext(source+';this.result=useMap()',ctx)
 const api=ctx.result,element={isConnected:true};api.mapEl.value=element
 const libraries={maps:{Map:class{constructor(el){assert.ok(el);maps.push(el)}addListener(){return{}}}},marker:{}}
 return{api,maps,element,unmount(){cleanup.forEach(fn=>fn())},async resolve(){const req=pending.shift();assert.ok(req);req.resolve(libraries[req.name]);await new Promise(r=>setImmediate(r))}}
}
test('late Maps imports after unmount, null element or replaced DOM never construct a map',async()=>{
 for(const interruption of ['unmount','null','replace','detached']){
  const h=harness(),init=h.api.initMap({farmacias:vue.ref([]),getColorForRegion(){}})
  await h.resolve()
  if(interruption==='unmount')h.unmount()
  if(interruption==='null')h.api.mapEl.value=null
  if(interruption==='replace')h.api.mapEl.value={isConnected:true}
  if(interruption==='detached')h.element.isConnected=false
  await h.resolve();await init;assert.equal(h.maps.length,0,interruption)
 }
})
test('new map request supersedes earlier pending imports and renders once on current DOM',async()=>{
 const h=harness(),first=h.api.initMap({farmacias:vue.ref([]),getColorForRegion(){}})
 const second=h.api.initMap({farmacias:vue.ref([]),getColorForRegion(){}})
 await h.resolve();await first;assert.equal(h.maps.length,0)
 await h.resolve();await h.resolve();await second;assert.equal(h.maps.length,1);assert.equal(h.maps[0],h.api.mapEl.value)
})
test('Vercel fallback excludes assets and HTML revalidates while all app routes still match',()=>{
 const config=JSON.parse(fs.readFileSync(require.resolve('../../vercel.json'),'utf8')),rewrite=config.rewrites[0],pattern=new RegExp('^'+rewrite.source+'$')
 for(const url of ['/','/farmacias/mapa','/admin/actualizaciones','/operaciones/mapa'])assert.equal(pattern.test(url),true)
 for(const url of ['/assets/old.js','/assets/old.css'])assert.equal(pattern.test(url),false)
 assert.ok(config.headers.some(rule=>rule.headers.some(h=>h.key==='Cache-Control'&&h.value.includes('must-revalidate'))))
})
