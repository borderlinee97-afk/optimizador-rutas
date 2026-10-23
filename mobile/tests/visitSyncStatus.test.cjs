const test=require('node:test'),assert=require('node:assert/strict')
const {loadTs,hooks}=require('./helpers/loadTs.cjs')
function harness({online=true}={}){
 const h=hooks();let calls=0,finish,photos={total:13,failed:2},error='TICKET: La evidencia necesita reintento'
 const session={user:{id:'owner'}}
 const Component=loadTs('src/components/VisitSyncStatus.tsx',{
  ...h.modules,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Pressable:'Button',Text:'Text',View:'View'},
  '../../storage/db':{isDatabaseActive:()=>true,db:{getFirstSync:sql=>sql.includes('count(*)')?photos:{last_error:error}}},
  '../context/AuthContext':{useAuth:()=>({session,profile:{area:'FARMACIAS'},accessState:online?'online':'offline'})},
  '../context/PlanContext':{usePlan:()=>({syncing:false,refresh:async()=>{}})},
  '../services/executionSync':{executionSummary:()=>[],retryPendingVisitSync:async(user,refresh)=>{
   calls++;assert.equal(user,'owner');await new Promise(r=>finish=r);photos={total:0,failed:0};error='';await refresh()
  }},
 },{setInterval:()=>1,clearInterval:()=>{}}).VisitSyncStatus
 h.mount(()=>({props:{value:Component({})}}))
 function nodes(value=h.value){return !value?[]:[value,...(Array.isArray(value.props?.children)?value.props.children:[value.props?.children]).filter(x=>x&&typeof x==='object').flatMap(nodes)]}
 return{h,nodes,calls:()=>calls,finish:()=>finish()}
}
test('sync banner shows failed photo errors and retries without a second enabled button',async()=>{
 const t=harness();await t.h.flush()
 const text=JSON.stringify(t.h.value);assert.match(text,/13," registros o fotos pendientes/);assert.match(text,/2 con error/);assert.match(text,/evidencia necesita reintento/)
 t.nodes().find(x=>x.type==='Button').props.onPress();await t.h.flush()
 assert.equal(t.calls(),1);assert.equal(t.nodes().find(x=>x.type==='Button').props.disabled,true)
 t.finish();await t.h.flush();assert.equal(t.h.value,null);t.h.stop()
})
test('offline pending data stays visible but cannot trigger a network retry',async()=>{
 const t=harness({online:false});await t.h.flush();assert.match(JSON.stringify(t.h.value),/13," registros/)
 assert.equal(t.nodes().filter(x=>x.type==='Button').length,0);assert.equal(t.calls(),0);t.h.stop()
})
