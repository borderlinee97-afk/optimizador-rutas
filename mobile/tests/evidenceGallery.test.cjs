const test=require('node:test'),assert=require('node:assert/strict')
const {loadTs,hooks}=require('./helpers/loadTs.cjs')
function harness(options={}){
 const h=hooks(),alerts=[],calls=[],removed=new Set();let revision=0
 const remotes=options.remote??Array.from({length:25},(_,i)=>({id:'photo-'+i,planItemId:'visit',activityId:null,capturedAt:'2026-11-06T12:00:00Z',signedUrl:'https://example.invalid/'+i,canRemove:true,status:'READY'}))
 const component=loadTs('src/components/EvidenceGallery.tsx',{
 ...h.modules,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
 'react-native':Object.fromEntries(['ActivityIndicator','Image','Modal','Pressable','SafeAreaView','ScrollView','Text','View'].map(name=>[name,name]).concat([['Alert',{alert:(...args)=>alerts.push(args)}]])),
 '@react-native-community/netinfo':{useNetInfo:()=>({isConnected:options.online!==false,isInternetReachable:options.online!==false})},
 '../../storage/db':{db:{},getDatabaseUserId:()=> 'owner',isDatabaseActive:()=>true},
 '../lib/api':{listVisitEvidence:async()=>{calls.push('list');revision++;return {evidence:remotes.filter(p=>!removed.has(p.id)).map(p=>({...p,signedUrl:p.signedUrl+'?revision='+revision}))}}},
 '../services/evidenceSync':{listLocalEvidence:()=>options.local??[],isEvidenceRemoved:id=>removed.has(id),rememberWithdrawnEvidence:()=>{},withdrawVisitEvidence:async(item,id)=>{calls.push('remove:'+id);if(options.failure)throw new Error('No confirmado');removed.add(id)}}
 }).EvidenceGallery
 h.mount(()=>({props:{value:component({planItemId:'visit',accessToken:'token',localEvidence:options.local,activityId:options.activityId})}}))
 function nodes(node=h.value){return !node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).filter(n=>n&&typeof n==='object').flatMap(n=>nodes(n))]}
 return {h,alerts,calls,nodes,photos:()=>nodes().filter(n=>n.props?.accessibilityLabel==='Ampliar evidencia fotográfica'),modal:()=>nodes().find(n=>n.type==='Modal')}
}
test('gallery shows 25 server photos and opens an enlarged photo with a renewed private URL',async()=>{
 const t=harness();try{await t.h.flush();assert.equal(t.photos().length,25);t.photos()[0].props.onPress();await t.h.flush();assert.equal(t.modal().props.visible,true);const image=t.nodes().find(n=>n.props?.accessibilityLabel==='Fotografía de evidencia ampliada');assert.match(image.props.source.uri,/revision=2/);assert.equal(t.calls.length,2)}finally{t.h.stop()}
})
test('owner confirms withdrawal from the viewer; photo disappears only after acknowledgement',async()=>{
 const t=harness();try{await t.h.flush();t.photos()[0].props.onPress();await t.h.flush();t.nodes().find(n=>n.type==='Pressable' && n.props.children?.props?.children==='Retirar foto').props.onPress();assert.equal(t.photos().length,25);t.alerts[0][2].find(b=>b.style==='destructive').onPress();await t.h.flush();assert.equal(t.photos().length,24);assert.equal(t.modal().props.visible,false);assert.ok(t.calls.includes('remove:photo-0'))}finally{t.h.stop()}
})
test('read-only reviewers can open photos without a withdrawal action',async()=>{
 const t=harness({remote:[{id:'p',activityId:null,capturedAt:'2026-11-06',signedUrl:'https://example.invalid/p',canRemove:false}]});try{await t.h.flush();t.photos()[0].props.onPress();await t.h.flush();assert.equal(t.nodes().some(n=>n.type==='Pressable'&&n.props.children?.props?.children==='Retirar foto'),false)}finally{t.h.stop()}
})
test('offline gallery opens the durable local image without requesting a remote URL',async()=>{
 const t=harness({online:false,local:[{id:'local',activityId:null,capturedAt:'2026-11-06',localUri:'file:///saved/photo.jpg',status:'PENDING'}]});try{await t.h.flush();assert.equal(t.photos().length,1);t.photos()[0].props.onPress();await t.h.flush();assert.equal(t.modal().props.visible,true);assert.equal(t.nodes().find(n=>n.props?.accessibilityLabel==='Fotografía de evidencia ampliada').props.source.uri,'file:///saved/photo.jpg');assert.equal(t.calls.length,0)}finally{t.h.stop()}
})
test('a READY local photo withdrawn on another device does not reappear from the local queue',async()=>{
 const t=harness({remote:[],local:[{id:'old',activityId:null,capturedAt:'2026-11-06',localUri:'file:///old.jpg',status:'READY'}]});try{await t.h.flush();assert.equal(t.photos().length,0)}finally{t.h.stop()}
})
