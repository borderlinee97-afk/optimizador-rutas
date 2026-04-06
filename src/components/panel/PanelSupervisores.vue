<template>
  <div>
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <button class="btn-primary" @click="$emit('new')">Nueva ruta (Supervisor)</button>
      <button class="btn-ghost" @click="$emit('refresh')">Refrescar</button>
    </div>

    <ul style="list-style:none; padding-left:0;">
      <li v-for="tpl in supTemplates" :key="tpl.id" style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #eee;">
        <span :style="{background:tpl.color||'#2E7D32', width:'10px', height:'10px', borderRadius:'50%'}"></span>
        <b>{{ tpl.name }}</b> · v{{ tpl.current_version }} · Supervisor: {{ tpl.supervisor_id || '—' }}
        <div style="margin-left:auto; display:flex; gap:6px;">
          <button class="btn-mini" @click="$emit('edit', tpl, regiones[0] || '')">Asignar farmacias (v+1)</button>
          <button class="btn-mini" @click="$emit('view', tpl)">Ver en mapa</button>
          <button class="btn-mini" @click="$emit('assign', tpl)">Asignar</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  supTemplates: { type: Array, required: true },
  regiones:     { type: Array, default: () => [] },
});
defineEmits(['new','refresh','edit','view','assign']);
</script>

<style scoped>
.btn-mini { background:#fff; color:#111827; border:1px solid #d1d5db; border-radius:6px; padding:4px 8px; cursor:pointer; }
.btn-primary { background:#fff; color:#111827; border:2px solid #111827; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700; }
.btn-ghost   { background:#fff; color:#111827; border:1px solid #d1d5db; padding:8px 12px; border-radius:8px; cursor:pointer; }
</style>
``