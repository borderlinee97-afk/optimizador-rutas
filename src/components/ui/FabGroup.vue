<template>
  <div class="fab-group">
    <button class="fab" @click="$emit('open-criteria')">Calcular ruta</button>
    <button class="fab" @click="$emit('toggle-traffic')">
      {{ trafficEnabled ? 'Ocultar tráfico' : 'Mostrar tráfico' }}
    </button>
    <button class="fab" @click="$emit('toggle-markers')">
      {{ markersVisible ? 'Ocultar marcadores' : 'Mostrar marcadores' }}
    </button>
    <button class="fab" @click="$emit('close-route')" :disabled="!hasAnyRoute">Cerrar ruta</button>
    <button class="fab" @click="$emit('open-persona')">+ Persona</button>
  </div>
</template>

<script setup>
defineProps({
  trafficEnabled: { type: Boolean, required: true },
  markersVisible: { type: Boolean, required: true },
  hasAnyRoute:    { type: Boolean, required: true },
});
defineEmits(['open-criteria','toggle-traffic','toggle-markers','close-route','open-persona']);
</script>

<style scoped>
.fab-group { position:absolute; top:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px; }
.fab { background:#fff; color:#111827; border:1px solid #d1d5db; padding:10px 14px; cursor:pointer; border-radius:8px; font-weight:600; box-shadow:0 2px 6px rgba(0,0,0,.15) }
</style>