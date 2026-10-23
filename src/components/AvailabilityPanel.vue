<template>
  <section v-if="data.enabled" class="availability-panel">
    <details>
      <summary>
        <span class="calendar" aria-hidden="true">▦</span>
        <span class="summary-copy"><span class="title">Vacaciones</span><span class="subtitle">{{ data.canRequest ? 'Solicita un periodo y consulta su estado' : 'Revisa las solicitudes de tu equipo' }}</span></span>
        <span class="chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="availability-body">
        <p v-if="data.canRequest" class="help">Indica tu primer y último día de vacaciones, escribe un motivo o comentario y envía la solicitud a revisión. Aquí podrás consultar si está pendiente, aprobada o rechazada.</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="message" class="success" role="status">{{ message }}</p>
        <form v-if="data.canRequest" @submit.prevent="submit">
          <label>Fecha de inicio<input v-model="form.startDate" type="date" :disabled="busy" required /><span class="field-help">Primer día de vacaciones.</span></label>
          <label>Fecha de término<input v-model="form.endDate" type="date" :min="form.startDate" :disabled="busy" required /><span class="field-help">Último día de vacaciones.</span></label>
          <label class="comment">Motivo o comentario<textarea v-model.trim="form.comment" :disabled="busy" rows="3" minlength="5" maxlength="2000" placeholder="Ejemplo: Solicito vacaciones del 2 al 6 de noviembre." required /><span class="field-help">Obligatorio · Mínimo 5 caracteres.</span></label>
          <button class="submit" type="submit" :disabled="busy">{{ busy ? 'Enviando…' : 'Enviar solicitud' }}</button>
        </form>
        <header class="requests-header"><h3>{{ data.canRequest ? 'Mis solicitudes' : 'Solicitudes del equipo' }}</h3><button class="refresh" type="button" :disabled="busy" @click="load">Actualizar</button></header>
        <p v-if="!data.requests.length" class="empty">{{ data.canRequest ? 'Aún no has enviado solicitudes de vacaciones.' : 'No hay solicitudes de vacaciones para revisar.' }}</p>
        <ul><li v-for="item in data.requests" :key="item.id"><div><strong>{{ item.supervisor_name }}</strong><p>Del {{ displayDate(item.start_date) }} al {{ displayDate(item.end_date) }}</p><p class="status">{{ label(item.status) }}{{ item.active ? ' · De vacaciones' : '' }}</p><p>{{ item.comment }}</p><p v-if="item.reviewed_by_name" class="help">Revisó: {{ item.reviewed_by_name }}<span v-if="item.review_comment"> · {{ item.review_comment }}</span></p></div><div v-if="item.can_review && item.status === 'PENDING_APPROVAL'" class="actions"><button type="button" :disabled="busy" @click="review(item,'APPROVED')">Aprobar solicitud</button><button class="secondary" type="button" :disabled="busy" @click="review(item,'REJECTED')">Rechazar solicitud</button></div></li></ul>
      </div>
    </details>
  </section>
</template>
<script setup>
import {onMounted,ref} from 'vue'
import {getAvailabilityRequests,createAvailabilityRequest,reviewAvailabilityRequest} from '../services/api.js'
const data=ref({enabled:false,canRequest:false,requests:[]}),busy=ref(false),error=ref(''),message=ref('')
const form=ref({id:'',startDate:'',endDate:'',comment:''})
const displayDate=value=>String(value??'').slice(0,10).split('-').reverse().join('/')
const label=value=>({PENDING_APPROVAL:'Pendiente de aprobación',APPROVED:'Aprobada',REJECTED:'Rechazada'})[value]??value
async function load(){try{data.value=await getAvailabilityRequests()}catch(e){if(data.value.enabled)error.value=e.message}}
function requestId(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`}
async function submit(){if(form.value.endDate<form.value.startDate){error.value='La fecha de término no puede ser anterior a la fecha de inicio.';return}busy.value=true;error.value='';message.value='';try{if(!form.value.id)form.value.id=requestId();await createAvailabilityRequest(form.value);form.value={id:'',startDate:'',endDate:'',comment:''};message.value='Tu solicitud se envió a revisión. Puedes consultar aquí su estado.';await load()}catch(e){error.value=e.message}finally{busy.value=false}}
async function review(item,decision){let comment='';if(decision==='REJECTED'){comment=window.prompt('Motivo del rechazo (mínimo 5 caracteres)')??'';if(comment.trim().length<5)return}else if(!window.confirm('¿Aprobar estas vacaciones?'))return;busy.value=true;error.value='';try{await reviewAvailabilityRequest(item.id,{decision,comment});await load()}catch(e){error.value=e.message}finally{busy.value=false}}
onMounted(load)
</script>
<style scoped>
.availability-panel{margin:20px 0;background:#fff;border:1px solid #dbe3ef;border-radius:16px;color:#182235;overflow:hidden}
summary{display:flex;align-items:center;gap:12px;list-style:none;padding:18px 20px;cursor:pointer;min-height:76px;box-sizing:border-box}
summary::-webkit-details-marker{display:none}summary:hover{background:#f8fafc}summary:focus-visible{outline:3px solid #93c5fd;outline-offset:-3px}
.calendar{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;border-radius:12px;background:#eff6ff;color:#0f64ad;font-size:25px}
.summary-copy{display:grid;gap:4px;flex:1}.title{font-size:20px;font-weight:700}.subtitle{font-size:14px;color:#475569}.chevron{font-size:24px;color:#475569;transition:transform .15s}details[open] .chevron{transform:rotate(180deg)}
.availability-body{padding:16px 20px 20px;border-top:1px solid #f1f5f9}.availability-panel p{margin:6px 0;font-size:14px;line-height:1.5}.help,.field-help{color:#475569}
.availability-panel form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:16px 0 20px;padding:16px;border-radius:12px;background:#f8fafc}.availability-panel label{display:grid;gap:7px;font-size:14px;font-weight:600}.field-help{font-size:12px;font-weight:400}.comment,.submit{grid-column:1/-1}
.availability-panel input,.availability-panel textarea,.availability-panel button{font:inherit;border:1px solid #cbd5e1;border-radius:10px;padding:11px;box-sizing:border-box}.availability-panel input,.availability-panel textarea{width:100%;min-width:0;color:#0f172a;background:#fff}.availability-panel textarea{resize:vertical;min-height:88px}.availability-panel textarea::placeholder{color:#64748b}
.availability-panel button{min-height:44px;color:#fff;background:#0f64ad;font-weight:600;cursor:pointer}.availability-panel button:disabled{opacity:.5;cursor:wait}.availability-panel button:focus-visible,.availability-panel input:focus-visible,.availability-panel textarea:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}
.requests-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}.requests-header h3{font-size:16px;margin:0}.availability-panel .refresh{color:#0f64ad;background:#fff;border-color:transparent}.empty{padding:12px;border-radius:10px;background:#f8fafc}
.availability-panel ul{list-style:none;padding:0;margin:0}.availability-panel li{display:flex;gap:16px;justify-content:space-between;margin-top:12px;padding:14px;border:1px solid #e2e8f0;border-radius:12px}.status{color:#0f64ad;font-weight:600}.actions{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}.availability-panel .secondary{color:#334155;background:#fff}.error{color:#b91c1c}.success{color:#166534}
@media(max-width:600px){.availability-panel form{grid-template-columns:minmax(0,1fr)}.availability-panel li{flex-direction:column}.actions button{flex:1}.subtitle{font-size:13px}}
</style>
