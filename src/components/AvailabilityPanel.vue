<template>
  <section v-if="data.enabled" class="availability-panel">
    <header><div><h2>Vacaciones</h2><p>Solicitudes de Puebla. Cualquiera de sus dos coordinadores puede aprobarlas.</p></div><button type="button" :disabled="busy" @click="load">Actualizar</button></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <form v-if="data.canRequest" @submit.prevent="submit">
      <label>Desde<input v-model="form.startDate" type="date" required /></label>
      <label>Hasta<input v-model="form.endDate" type="date" :min="form.startDate" required /></label>
      <label class="comment">Comentario<input v-model.trim="form.comment" minlength="5" maxlength="2000" required /></label>
      <button type="submit" :disabled="busy">Enviar a coordinadores</button>
    </form>
    <p v-if="!data.requests.length">Sin solicitudes.</p>
    <ul><li v-for="item in data.requests" :key="item.id"><div><strong>{{ item.supervisor_name }}</strong><p>{{ iso(item.start_date) }} — {{ iso(item.end_date) }} · {{ label(item.status) }}{{ item.active ? ' · De vacaciones' : '' }}</p><p>{{ item.comment }}</p><p v-if="item.reviewed_by_name">Revisó: {{ item.reviewed_by_name }}<span v-if="item.review_comment"> · {{ item.review_comment }}</span></p></div><div v-if="!data.canRequest && item.status === 'PENDING_APPROVAL'" class="actions"><button type="button" :disabled="busy" @click="review(item,'APPROVED')">Aprobar</button><button type="button" :disabled="busy" @click="review(item,'REJECTED')">Rechazar</button></div></li></ul>
  </section>
</template>
<script setup>
import {onMounted,ref} from 'vue'
import {getAvailabilityRequests,createAvailabilityRequest,reviewAvailabilityRequest} from '../services/api.js'
const data=ref({enabled:false,canRequest:false,requests:[]}),busy=ref(false),error=ref(''),message=ref('')
const form=ref({id:'',startDate:'',endDate:'',comment:''})
const iso=value=>String(value??'').slice(0,10)
const label=value=>({PENDING_APPROVAL:'Pendiente de aprobación',APPROVED:'Aprobada',REJECTED:'Rechazada'})[value]??value
async function load(){try{data.value=await getAvailabilityRequests()}catch(e){if(data.value.enabled)error.value=e.message}}
function requestId(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`}
async function submit(){if(form.value.endDate<form.value.startDate){error.value='Revisa las fechas.';return}busy.value=true;error.value='';message.value='';try{if(!form.value.id)form.value.id=requestId();await createAvailabilityRequest(form.value);form.value={id:'',startDate:'',endDate:'',comment:''};message.value='Solicitud enviada a los coordinadores.';await load()}catch(e){error.value=e.message}finally{busy.value=false}}
async function review(item,decision){let comment='';if(decision==='REJECTED'){comment=window.prompt('Motivo del rechazo (mínimo 5 caracteres)')??'';if(comment.trim().length<5)return}else if(!window.confirm('¿Aprobar estas vacaciones?'))return;busy.value=true;error.value='';try{await reviewAvailabilityRequest(item.id,{decision,comment});await load()}catch(e){error.value=e.message}finally{busy.value=false}}
onMounted(load)
</script>
<style scoped>
.availability-panel{margin:20px 0;padding:20px;background:#fff;border:1px solid #dbe3ef;border-radius:16px;color:#182235}.availability-panel header,.availability-panel li,.actions{display:flex;gap:12px;justify-content:space-between}.availability-panel h2{font-size:20px;margin:0}.availability-panel p{margin:6px 0;font-size:14px}.availability-panel form{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:16px 0}.availability-panel label{display:grid;gap:6px}.comment{flex:1}.availability-panel input,.availability-panel button{font:inherit;border:1px solid #cbd5e1;border-radius:8px;padding:10px}.availability-panel button{color:#fff;background:#2862ad;cursor:pointer}.availability-panel button:disabled{opacity:.5}.availability-panel ul{list-style:none;padding:0;margin:0}.availability-panel li{padding:12px 0;border-top:1px solid #e2e8f0}.error{color:#b91c1c}
</style>
