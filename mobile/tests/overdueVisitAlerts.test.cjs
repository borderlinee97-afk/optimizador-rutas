const test=require('node:test'),assert=require('node:assert/strict')
const {hooks,loadTs}=require('./helpers/loadTs.cjs')
function harness(){
 const runner=hooks(),calls=[],links=[]
 const auth={session:{user:{id:'a'},access_token:'token'},profile:{area:'FARMACIAS',rol:'COORDINADOR'},accessState:'online'}
 let response={total:1,visits:[{id:'v',planId:'p',personName:'Supervisor',name:'Unidad',scheduledDate:'2026-10-30',reason:'Sin finalizar'}]},failure=null
 class ApiError extends Error{constructor(status){super('Denied');this.status=status}}
 const jsx=(type,props)=>({type,props})
 const module=loadTs('src/components/OverdueVisitAlerts.tsx',{
  ...runner.modules,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{Pressable:'Button',Text:'Text',View:'View'},
  'expo-router':{useFocusEffect:fn=>runner.modules.react.useEffect(fn,[fn]),router:{push:link=>links.push(link)}},
  '../context/AuthContext':{useAuth:()=>auth},'../lib/api':{ApiError,apiRequest:async path=>{calls.push(path);if(failure)throw failure;return response}},
 })
 runner.mount(()=>({props:{value:module.OverdueVisitAlerts()}}))
 const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
 const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):n&&typeof n==='object'?text(n.props?.children):String(n??'')
 return{runner,auth,calls,links,nodes:()=>nodes(runner.value),text:()=>text(runner.value),fail(status){failure=new ApiError(status)}}
}
test('boss sees count, unresolved visit and a link to the existing plan; another account never sees that snapshot',async()=>{
 const h=harness();await h.runner.flush();assert.match(h.text(),/1 visitas de días anteriores/);assert.match(h.text(),/Sin finalizar/)
 h.nodes().find(n=>n.props.accessibilityLabel==='Revisar plan de Supervisor').props.onPress();assert.equal(h.links[0].params.id,'p')
 h.auth.session={user:{id:'b'},access_token:'other'};h.auth.accessState='offline';h.runner.rerender();await h.runner.flush();assert.doesNotMatch(h.text(),/Supervisor|Sin finalizar/)
})
test('denied refresh hides previous alerts instead of keeping revoked data; supervisor cannot request team alerts',async()=>{
 const h=harness();await h.runner.flush();h.fail(403)
 h.nodes().find(n=>n.type==='Button'&&n.props.children.props.children==='Actualizar seguimiento').props.onPress();await h.runner.flush()
 assert.match(h.text(),/No se pudo actualizar/);assert.doesNotMatch(h.text(),/Supervisor|Sin finalizar/)
 h.auth.profile.rol='SUPERVISOR';h.runner.rerender();await h.runner.flush();assert.equal(h.runner.value,null);assert.equal(h.calls.length,2)
})
