const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {parse,compileScript}=require('@vue/compiler-sfc'),vue=require('vue')
function harness(options={}) {
 const {descriptor}=parse(fs.readFileSync(require.resolve('../../src/components/VisitEvidenceGallery.vue'),'utf8'))
 const source=compileScript(descriptor,{id:'gallery'}).content.replace(/import\s+[\s\S]*?from\s+'[^']+'\s*/g,'').replace('export default','module.exports =')
 const events=[],calls=[],photos=Array.from({length:25},(_,i)=>({id:'p'+i,signedUrl:'private://photo/'+i,capturedAt:'2026-11-06T12:00:00Z',canRemove:true}))
 const ctx={module:{exports:{}},computed:vue.computed,ref:vue.ref,watch(){},onBeforeUnmount(){},nextTick:async()=>{},
 window:{confirm:()=>options.confirm!==false},getVisitEvidence:async()=>{calls.push('list');return {evidence:photos}},removeVisitEvidence:async(item,id)=>{calls.push('remove:'+id);if(options.failure)throw new Error('No confirmado');return {ok:true,removed:true}}}
 vm.runInNewContext(source,ctx)
 return {state:ctx.module.exports.setup({itemId:'visit'},{expose(){},emit:(...args)=>events.push(args)}),calls,events}
}
test('web gallery lists 25 photos and opens a viewer with refreshed links',async()=>{
 const h=harness();await h.state.refresh();assert.equal(h.state.photos.value.length,25);h.state.open('p17');await new Promise(setImmediate);assert.equal(h.state.active.value.id,'p17');assert.equal(h.calls.length,2)
})
test('web withdrawal requires confirmation and hides only the acknowledged photo',async()=>{
 const h=harness();await h.state.refresh();h.state.open('p0');await new Promise(setImmediate);await h.state.remove();assert.equal(h.state.photos.value.length,24);assert.equal(h.state.selectedId.value,null);assert.deepEqual(h.events,[['removed','p0']])
})
test('a cancelled or failed withdrawal keeps the photo visible',async()=>{
 for(const options of [{confirm:false},{failure:true}]) {
  const h=harness(options);await h.state.refresh();h.state.open('p0');await new Promise(setImmediate);await h.state.remove();assert.equal(h.state.photos.value.length,25);assert.equal(h.state.active.value.id,'p0');assert.equal(h.events.length,0)
 }
})
