<template>
  <section v-if="showEmpty || planId || requests.length || error" class="edit-access" aria-label="Autorización de edición">
    <header><div><h2>{{ planId ? 'Edición del plan' : 'Solicitudes de edición' }}</h2><p>Se permite cambiar únicamente el día vigente y los posteriores. Las visitas iniciadas y los días pasados permanecen bloqueados.</p></div><button type="button" :disabled="busy" @click="refresh">Actualizar</button></header>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="planId && access">
      <p v-if="access.request"><strong>{{ labels[access.request.status] }}</strong> · {{ access.request.reason }}</p>
      <template v-if="access.canRequest"><button type="button" :disabled="busy" @click="open=!open">Solicitar edición</button><form v-if="open" @submit.prevent="act(planId,'request')"><label :for="`edit-reason-${planId}`">¿Qué necesitas modificar y por qué?</label><textarea :id="`edit-reason-${planId}`" v-model="reason" rows="3" maxlength="2000" required placeholder="Describe los cambios que necesitas realizar."></textarea><button type="submit" :disabled="busy || !reason.trim()">Enviar solicitud de autorización</button></form></template>
      <template v-if="access.canEdit"><p>Edición autorizada desde {{ access.minDate }}. Finaliza el permiso cuando termines.</p><button v-if="!editing" type="button" @click="router.push({name:'farmacias-supervisor-plan-editor',params:{planId}})">Editar visitas autorizadas</button></template>
      <button v-if="access.canFinish" type="button" :disabled="busy" @click="act(planId,'finish')">Finalizar edición</button>
      <div v-if="access.canReview" class="actions"><button type="button" :disabled="busy" @click="act(planId,'approve')">Autorizar edición</button><button type="button" :disabled="busy" @click="act(planId,'reject')">Rechazar solicitud</button></div>
    </template>
    <p v-if="!planId && !requests.length && !error">Sin solicitudes de edición pendientes.</p>
    <article v-for="request in requests" :key="request.id"><strong>{{ request.owner_name }}</strong><p>{{ request.plan_type==='EXTRAORDINARY'?'Plan extraordinario':'Plan ordinario' }} · {{ String(request.period_start).slice(0,10) }} — {{ String(request.period_end).slice(0,10) }}</p><p>{{ request.reason }}</p><div class="actions"><button type="button" @click="router.push({name:'farmacias-plan-detail',params:{planId:request.plan_id}})">Ver plan</button><button type="button" v-if="!readonly" :disabled="busy" @click="act(request.plan_id,'approve')">Autorizar edición</button><button type="button" v-if="!readonly" :disabled="busy" @click="act(request.plan_id,'reject')">Rechazar</button></div></article>
  </section>
</template>
<script setup>
import {onMounted,ref,watch} from 'vue'
import {useRouter} from 'vue-router'
import {getPlanEditAccess,listPlanEditRequests,changePlanEditRequest} from '../services/api.js'
const props=defineProps({planId:{type:String,default:''},editing:Boolean,initiallyOpen:Boolean,inboxRequests:{type:Array,default:null},showEmpty:Boolean,readonly:Boolean})
const emit=defineEmits(['updated','access','refresh'])
const router=useRouter(),access=ref(null),requests=ref([]),reason=ref(''),error=ref(''),message=ref(''),open=ref(props.initiallyOpen),busy=ref(false)
const labels={PENDING:'Autorización pendiente',APPROVED:'Edición autorizada',REJECTED:'Solicitud rechazada',COMPLETED:'Edición finalizada'}
async function load(){error.value='';try{if(props.planId){access.value=await getPlanEditAccess(props.planId);emit('access',access.value)}else{requests.value=props.inboxRequests ?? (await listPlanEditRequests()).requests}}catch(e){error.value=e.message||'No se pudo consultar la autorización.';access.value=null;requests.value=[];emit('access',null)}}
async function act(id,action){if(busy.value || props.readonly)return;if(['approve','reject','finish'].includes(action)&&!window.confirm({approve:'¿Autorizar cambios del día vigente en adelante?',reject:'¿Rechazar esta solicitud?',finish:'¿Finalizar el permiso de edición?'}[action]))return;busy.value=true;error.value='';try{await changePlanEditRequest(id,action,reason.value.trim());reason.value='';open.value=false;message.value={request:'Solicitud enviada.',approve:'Edición autorizada.',reject:'Solicitud rechazada.',finish:'Edición finalizada.'}[action];await load();emit('updated')}catch(e){error.value=e.message||'No fue posible guardar la solicitud.'}finally{busy.value=false}}
function refresh(){if(!props.planId && props.inboxRequests!==null)emit('refresh');else void load()}
onMounted(load);watch(()=>props.planId,load);watch(()=>props.inboxRequests,()=>{if(!props.planId)void load()})
</script>
<style scoped>
.edit-access{padding:22px;border:1px solid #dbe4ee;border-radius:18px;background:#f8fafc;margin:18px 0;color:#182b46}.edit-access header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.edit-access h2{font-size:19px;margin:0 0 8px}.edit-access p{line-height:1.5;margin:8px 0}.edit-access button{border:1px solid #b9cadd;background:white;color:#12517e;border-radius:10px;padding:10px 14px;cursor:pointer;margin:5px 7px 5px 0;font-weight:600}.edit-access button:disabled{opacity:.5;cursor:wait}.edit-access form{margin-top:14px}.edit-access label{display:block;font-weight:600;margin-bottom:8px}.edit-access textarea{display:block;box-sizing:border-box;width:100%;max-width:720px;border:1px solid #bccbdb;border-radius:10px;padding:12px;font:inherit;color:#111;background:white}.edit-access article{border-top:1px solid #dbe4ee;padding-top:14px;margin-top:14px}.edit-access .error{color:#a31e33}.actions{display:flex;flex-wrap:wrap}
</style>
