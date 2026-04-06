<template>
  <div>
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <button class="btn-primary" @click="$emit('new')">+ Persona</button>
      <button class="btn-ghost" @click="$emit('refresh')" :disabled="!personasLoaded">Refrescar</button>
    </div>

    <ul style="list-style:none; padding-left:0;">
      <li v-for="p in personas" :key="p.id" style="display:flex; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid #eee;">
        <span class="badge">{{ p.rol }}</span>
        <b>{{ p.nombre }}</b>
        <span>· {{ p.activo ? 'activo' : 'inactivo' }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  personas:       { type: Array,  required: true },
  personasLoaded: { type: Boolean, default: false },
});
defineEmits(['new','refresh']);
</script>

<style scoped>
.btn-primary { background:#fff; color:#111827; border:2px solid #111827; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700; }
.btn-ghost   { background:#fff; color:#111827; border:1px solid #d1d5db; padding:8px 12px; border-radius:8px; cursor:pointer; }
.badge { padding:2px 8px; border-radius:12px; border:1px solid #ddd; background:#f8f8f8; font-size:12px; color:#111827; }
</style>