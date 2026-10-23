<template>
 <section v-if="systemRole==='ADMIN'" class="apk-admin">
  <header class="page-head"><div><p class="eyebrow">Administración</p><h1>Actualizaciones de la app</h1><p>Elige una compilación de Expo, verifícala y publica únicamente la versión que hayas probado.</p></div><button type="button" :disabled="busy||loading" @click="load">Actualizar panel</button></header>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p><p v-if="message" class="notice success" role="status">{{ message }}</p>
  <p v-if="loading" role="status">Cargando canal de actualizaciones…</p>
  <template v-if="state">
   <div class="summary-grid">
    <article class="card"><span class="muted">Versión disponible para los usuarios</span><h2>{{ state.current ? `${state.current.version} · código ${state.current.versionCode}` : 'Ninguna versión publicada' }}</h2><p>{{ state.current?.notes || 'Verificar una APK no la publica. Primero pruébala y después confirma su publicación.' }}</p></article>
    <article class="card"><span class="muted">Cómo actualizan los usuarios</span><h2>Desde la propia app</h2><p>Pulsan Actualizar, la app descarga la APK y Android pide confirmar la instalación. No necesitan abrir el enlace de Expo.</p></article>
   </div>
   <p v-if="!state.expoConfigured" class="notice warning">La conexión con Expo requiere configurar EXPO_TOKEN en el backend. La credencial no se captura ni se guarda en esta página.</p>
   <article class="card">
    <h2>1. Verificar la APK probada</h2><p class="muted">Pega el enlace de la compilación del proyecto app-de-rutas. La APK permanecerá alojada en Expo.</p>
    <form @submit.prevent="prepare">
     <label>Compilación de Expo<input v-model.trim="buildUrl" @input="clearSelection" type="text" required maxlength="300" placeholder="https://expo.dev/accounts/borderline97/projects/app-de-rutas/builds/…" :disabled="busy" /></label>
     <label>Novedades de esta versión<textarea v-model="notes" @input="clearSelection" rows="3" maxlength="4000" :disabled="busy" placeholder="Describe los cambios que verán los usuarios." /></label>
     <button class="primary" :disabled="busy||!state.expoConfigured" type="submit">{{ busy ? 'Procesando…' : 'Verificar compilación' }}</button><p class="muted">La verificación puede tardar unos minutos porque se comprueba el archivo completo.</p>
    </form>
   </article>
   <article v-if="candidate" class="card candidate">
    <h2>2. Publicar versión verificada</h2><p class="version">{{ candidate.version }} · código {{ candidate.versionCode }} · {{ size(candidate.byteSize) }}</p><p>{{ candidate.notes || 'Sin notas adicionales.' }}</p><details><summary>Integridad del archivo</summary><code>{{ candidate.sha256 }}</code></details>
    <label class="check"><input v-model="confirmed" type="checkbox" :disabled="busy" /> Probé esta APK y apruebo que se ofrezca como actualización a los usuarios.</label>
    <p v-if="candidate.versionCode<=state.highestVersionCode" class="notice warning">Este código ya fue publicado o es anterior. Para una nueva actualización se requiere un código superior.</p>
    <button class="primary" type="button" :disabled="busy||!confirmed||!state.expoConfigured||candidate.versionCode<=state.highestVersionCode" @click="publish">Publicar actualización</button>
   </article>
   <article v-if="state.current" class="card"><h2>Retirar la actualización disponible</h2><p class="muted">Deja de ofrecerse a nuevas descargas. Los teléfonos conservan la versión que ya instalaron.</p><label>Motivo<input v-model="withdrawReason" maxlength="500" minlength="5" :disabled="busy" placeholder="Indica el motivo del retiro." /></label><button class="danger" type="button" :disabled="busy||withdrawReason.trim().length<5" @click="withdraw">Retirar actualización</button></article>
   <article class="card"><h2>Compilaciones verificadas</h2><p v-if="!state.releases.length" class="muted">Aún no hay compilaciones verificadas desde este panel.</p><div v-else class="table-scroll"><table><thead><tr><th>Versión</th><th>Verificó</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead><tbody><tr v-for="item in state.releases" :key="item.build_id"><td>{{ item.metadata.version }} ({{ item.version_code }})</td><td>{{ item.prepared_by_name }}</td><td>{{ date(item.prepared_at) }}</td><td>{{ state.current?.buildId===item.build_id ? 'Publicada' : item.published_at ? 'Publicada anteriormente' : 'Verificada' }}</td><td><button type="button" :disabled="busy" @click="select(item)">Seleccionar</button></td></tr></tbody></table></div></article>
   <article class="card"><h2>Historial de cambios</h2><p v-if="!state.events.length" class="muted">Las verificaciones, publicaciones y retiros quedarán registrados aquí.</p><ol v-else class="history"><li v-for="(event,index) in state.events" :key="index"><strong>{{ action(event.action) }}</strong> · {{ event.actor_name }} · {{ date(event.created_at) }}<p v-if="event.reason">{{ event.reason }}</p></li></ol></article>
  </template>
 </section>
 <p v-else role="alert">Este panel está disponible únicamente para administradores.</p>
</template>
<script setup>
import {ref,watch} from 'vue'
import {useAuth} from '../../composables/useAuth.js'
import {androidUpdatesApi} from '../../services/api.js'
const {systemRole,profile}=useAuth()
const state=ref(null),candidate=ref(null),buildUrl=ref(''),notes=ref(''),confirmed=ref(false),withdrawReason=ref('')
const loading=ref(false),busy=ref(false),error=ref(''),message=ref('')
let epoch=0
const owner=()=>systemRole.value==='ADMIN'?profile.value?.id:null
const date=value=>new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(value))
const size=value=>`${(value/1024/1024).toFixed(1)} MB`
const action=value=>({PREPARED:'APK verificada',PUBLISHED:'Actualización publicada',WITHDRAWN:'Actualización retirada'}[value]??value)
function clearSelection(){candidate.value=null;confirmed.value=false}
async function load(){
 if(!owner())return
 const generation=epoch;loading.value=true;error.value=''
 try{const response=await androidUpdatesApi();if(generation===epoch)state.value=response}
 catch(e){if(generation===epoch)error.value=e.message}
 finally{if(generation===epoch)loading.value=false}
}
async function run(task,success){
 if(busy.value||!owner())return
 const generation=epoch;busy.value=true;error.value='';message.value=''
 try{const result=await task();if(generation!==epoch)return;message.value=success;await load();return result}
 catch(e){if(generation===epoch){error.value=e.message;if(e.code==='APP_UPDATE_STALE'){await load();error.value='El canal cambió. Revisa el estado actualizado antes de continuar.'}}}
 finally{if(generation===epoch)busy.value=false}
}
async function prepare(){
 clearSelection()
 const response=await run(()=>androidUpdatesApi('/prepare',{buildUrl:buildUrl.value,notes:notes.value}),'APK verificada. Confirma la prueba antes de publicarla.')
 if(response){candidate.value=response.release;confirmed.value=false}
}
function select(item){candidate.value=item.metadata;buildUrl.value=`https://expo.dev/accounts/borderline97/projects/app-de-rutas/builds/${item.build_id}`;notes.value=item.metadata.notes;confirmed.value=false}
async function publish(){
 if(!confirmed.value||!candidate.value||!state.value)return
 const response=await run(()=>androidUpdatesApi('/publish',{buildId:candidate.value.buildId,expectedRevision:state.value.revision,confirmTested:confirmed.value}),'Actualización publicada. La app la ofrecerá al consultar versiones con conexión.')
 if(response)clearSelection()
}
async function withdraw(){
 if(!state.value)return
 const response=await run(()=>androidUpdatesApi('/withdraw',{expectedRevision:state.value.revision,reason:withdrawReason.value}),'Actualización retirada del canal.')
 if(response)withdrawReason.value=''
}
watch([systemRole,()=>profile.value?.id],()=>{epoch++;state.value=null;clearSelection();buildUrl.value='';notes.value='';withdrawReason.value='';error.value='';message.value='';loading.value=false;busy.value=false;void load()},{immediate:true})
</script>
<style scoped>
.apk-admin{max-width:1120px;margin:0 auto;padding:24px 20px 110px;color:#182235}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.eyebrow{margin:0;color:#2862ad;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em}h1{font-size:28px;margin:6px 0 10px}h2{font-size:19px;margin:8px 0 12px}p{line-height:1.6;margin:8px 0}.muted{color:#536479}.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{background:#fff;border:1px solid #dce4ef;border-radius:16px;padding:22px;margin-bottom:20px;box-shadow:0 3px 12px #18223505}.candidate{border-color:#91b3df}.version{font-weight:700;color:#175897}label{display:grid;gap:8px;margin:15px 0;font-weight:600}input,textarea,button{font:inherit;border:1px solid #c7d3e2;border-radius:10px;padding:11px 13px;box-sizing:border-box}input,textarea{width:100%;background:#fff;color:#17233a}textarea{resize:vertical}button{cursor:pointer;background:#fff;color:#235c9c;font-weight:600;min-height:44px}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:#175eac;border-color:#175eac;color:#fff}.danger{color:#a02424;border-color:#d5aaaa}.check{display:flex;align-items:flex-start;gap:10px;font-weight:500;line-height:1.6}.check input{width:18px;height:18px;margin-top:4px;flex-shrink:0}.notice{padding:12px 16px;border-radius:10px;background:#f1f5f9}.error{background:#fff0f0;color:#9d2424}.success{background:#eaf7ef;color:#1d6841}.warning{background:#fff7e5;color:#805214}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:650px}th,td{padding:12px;text-align:left;border-bottom:1px solid #e3e9f2;font-size:14px}th{color:#4d617a;background:#f7f9fc}.history{padding-left:22px}.history li{padding:10px 0}code{display:block;overflow-wrap:anywhere;font-size:12px;padding:10px;background:#f5f7fb}summary{cursor:pointer;color:#375f8f}input:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid #a4c5ee;outline-offset:2px}@media(max-width:700px){.summary-grid{grid-template-columns:1fr}.page-head{flex-direction:column}.apk-admin{padding:20px 12px 120px}.card{padding:17px}h1{font-size:24px}}
</style>
